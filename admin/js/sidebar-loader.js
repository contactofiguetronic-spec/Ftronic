// sidebar-loader.js — Carga sidebar desde partials/sidebar.html
// Reemplaza el sidebar inline duplicado en 33+ HTML files.
(function(){
    var mount = document.getElementById('sidebar-mount');
    if (!mount) return;

    var currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';

    fetch('/admin/partials/sidebar.html')
        .then(function(r){
            if (!r.ok) throw new Error('Sidebar fetch failed: ' + r.status);
            return r.text();
        })
        .then(function(html){
            mount.innerHTML = html;
            mount.classList.add('sidebar');
            mount.id = 'sidebar';

            var items = mount.querySelectorAll('.nav-item');
            for (var i = 0; i < items.length; i++){
                var href = items[i].getAttribute('href');
                if (href === currentPage){
                    items[i].classList.add('active');
                }
            }

            var searchInput = mount.querySelector('#navSearch');
            var emptyMsg = mount.querySelector('.nav-search-empty');
            if (searchInput){
                searchInput.addEventListener('input', function(){
                    var q = this.value.toLowerCase();
                    var anyVisible = false;
                    for (var j = 0; j < items.length; j++){
                        var title = (items[j].getAttribute('title') || '').toLowerCase();
                        var match = !q || title.indexOf(q) !== -1;
                        items[j].style.display = match ? '' : 'none';
                        if (match) anyVisible = true;
                    }
                    var groups = mount.querySelectorAll('.nav-group-title');
                    for (var g = 0; g < groups.length; g++){
                        groups[g].style.display = q ? 'none' : '';
                    }
                    if (emptyMsg) emptyMsg.style.display = anyVisible ? 'none' : 'block';
                });
            }

            var collapseBtn = mount.querySelector('#sidebarCollapseBtn');
            if (collapseBtn){
                collapseBtn.addEventListener('click', function(){
                    mount.classList.toggle('collapsed');
                });
            }

            var toggleBtn = document.getElementById('menuToggle');
            if (toggleBtn){
                toggleBtn.addEventListener('click', function(){
                    mount.classList.toggle('open');
                });
            }

            // Only apply permissions if auth has completed (__user is set)
            if (typeof UIController !== 'undefined' && window.__user){
                UIController.init();
            }
            if (typeof loadNavCounts === 'function'){
                loadNavCounts();
            }
        })
        .catch(function(e){
            console.error('Sidebar load failed:', e);
        });
})();
