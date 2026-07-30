class VirtualScroller {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            itemHeight: 72,
            overscan: 5,
            ...options
        };

        this.items = [];
        this.renderItem = null;
        this.visibleRange = { start: 0, end: 0 };

        this.viewport = null;
        this.phantom = null;
        this.itemsEl = null;
        this._animationFrame = null;

        this._init();
    }

    _init() {
        this.container.style.position = 'relative';
        this.container.classList.add('virtual-scroll-viewport');

        this.phantom = document.createElement('div');
        this.phantom.className = 'virtual-scroll-phantom';
        this.container.appendChild(this.phantom);

        this.itemsEl = document.createElement('div');
        this.itemsEl.className = 'virtual-scroll-items';
        this.container.appendChild(this.itemsEl);

        this.viewport = this.container;

        this._onScroll = () => {
            if (this._animationFrame) cancelAnimationFrame(this._animationFrame);
            this._animationFrame = requestAnimationFrame(() => this._update());
        };

        this.viewport.addEventListener('scroll', this._onScroll, { passive: true });
    }

    setItems(items, renderItem) {
        this.items = items || [];
        this.renderItem = renderItem;
        this._updateTotalHeight();
        this._update();
    }

    _getViewportHeight() {
        return this.viewport.clientHeight;
    }

    _getScrollTop() {
        return this.viewport.scrollTop;
    }

    _updateTotalHeight() {
        const totalHeight = this.items.length * this.options.itemHeight;
        this.phantom.style.height = totalHeight + 'px';
    }

    _update() {
        if (!this.items.length || !this.renderItem) {
            this.itemsEl.innerHTML = '';
            return;
        }

        const scrollTop = this._getScrollTop();
        const viewportHeight = this._getViewportHeight();

        const buffer = this.options.overscan * this.options.itemHeight;
        const startOffset = Math.max(0, scrollTop - buffer);
        const endOffset = scrollTop + viewportHeight + buffer;

        const startIndex = Math.max(0, Math.floor(startOffset / this.options.itemHeight));
        const endIndex = Math.min(this.items.length, Math.ceil(endOffset / this.options.itemHeight));

        if (this.visibleRange.start === startIndex && this.visibleRange.end === endIndex) return;
        this.visibleRange = { start: startIndex, end: endIndex };

        const fragment = document.createDocumentFragment();

        for (let i = startIndex; i < endIndex; i++) {
            const item = this.items[i];
            const el = this.renderItem(item, i);

            if (el) {
                el.style.position = 'absolute';
                el.style.top = (i * this.options.itemHeight) + 'px';
                el.style.left = '0';
                el.style.right = '0';
                el.style.height = this.options.itemHeight + 'px';
                fragment.appendChild(el);
            }
        }

        this.itemsEl.innerHTML = '';
        this.itemsEl.appendChild(fragment);
    }

    scrollTo(index) {
        if (index < 0 || index >= this.items.length) return;
        const top = index * this.options.itemHeight;
        this.viewport.scrollTop = top;
    }

    refresh() {
        this._updateTotalHeight();
        this._update();
    }

    destroy() {
        if (this.viewport && this._onScroll) {
            this.viewport.removeEventListener('scroll', this._onScroll);
        }
        if (this._animationFrame) cancelAnimationFrame(this._animationFrame);
        this.container.innerHTML = '';
        this.container.classList.remove('virtual-scroll-viewport');
    }
}
