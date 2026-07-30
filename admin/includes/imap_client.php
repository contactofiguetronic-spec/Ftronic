<?php
/**
 * Cliente IMAP puro en PHP — sin dependencia de ext-imap.
 * Usa fsockopen + SSL para conectarse al servidor IMAP.
 * Soporta: LOGIN, SELECT, FETCH, SEARCH, STORE, MOVE, EXPUNGE, IDLE (basico).
 */

class ImapClient {
    private $conn = false;
    private $host = '';
    private $port = 993;
    private $username = '';
    private $password = '';
    private $lastTag = 0;
    private $debug = false;

    public function __construct(string $host, int $port, string $username, string $password, bool $debug = false) {
        $this->host = $host;
        $this->port = $port;
        $this->username = $username;
        $this->password = $password;
        $this->debug = $debug;
    }

    public function __destruct() {
        $this->disconnect();
    }

    public function connect(): bool {
        $remote = "ssl://{$this->host}";
        $errno = 0;
        $errstr = '';
        $this->conn = @fsockopen($remote, $this->port, $errno, $errstr, 15);
        if (!$this->conn) {
            throw new Exception("IMAP connection failed: $errstr ($errno)");
        }
        stream_set_timeout($this->conn, 30);
        $greeting = $this->readResponse();
        if ($this->debug) error_log("[IMAP] Greeting: $greeting");
        return true;
    }

    public function disconnect() {
        if ($this->conn) {
            try { $this->sendCommand('LOGOUT'); } catch (\Exception $e) {}
            fclose($this->conn);
            $this->conn = false;
        }
    }

    public function login(): bool {
        $resp = $this->sendCommand("LOGIN \"{$this->username}\" \"{$this->password}\"");
        if ($this->debug) error_log("[IMAP] LOGIN: $resp");
        return stripos($resp, 'OK') !== false;
    }

    public function selectFolder(string $folder = 'INBOX'): array {
        $resp = $this->sendCommand("SELECT \"$folder\"");
        $info = ['exists' => 0, 'recent' => 0, 'flags' => ''];
        if (preg_match('/\*\s+(\d+)\s+EXISTS/', $resp, $m)) $info['exists'] = (int)$m[1];
        if (preg_match('/\*\s+(\d+)\s+RECENT/', $resp, $m)) $info['recent'] = (int)$m[1];
        if (preg_match('/\*\s+FLAGS\s+\(([^)]*)\)/', $resp, $m)) $info['flags'] = trim($m[1]);
        return $info;
    }

    public function getFolders(): array {
        $resp = $this->sendCommand('LIST "" "*"');
        $folders = [];
        foreach (explode("\n", $resp) as $line) {
            if (preg_match('/^\*\s+LIST\s+\(([^)]*)\)\s+"([^"]*)"\s+"?([^"]+)"?\s*$/i', trim($line), $m)) {
                $flags = $m[1];
                $delimiter = $m[2];
                $name = trim($m[3], '"');
                $folders[] = ['name' => $name, 'flags' => $flags, 'delimiter' => $delimiter];
            }
        }
        return $folders;
    }

    public function searchUnseen(): array {
        $resp = $this->sendCommand('SEARCH UNSEEN');
        return $this->parseSearchIds($resp);
    }

    public function searchAll(): array {
        $resp = $this->sendCommand('SEARCH ALL');
        return $this->parseSearchIds($resp);
    }

    public function searchSince(string $date): array {
        $resp = $this->sendCommand("SEARCH SINCE \"$date\"");
        return $this->parseSearchIds($resp);
    }

    public function searchSinceUid(string $uid): array {
        $resp = $this->sendCommand("SEARCH UID " . ((int)$uid + 1) . ":*");
        return $this->parseSearchIds($resp);
    }

    public function getMessagesInfo(array $uids, bool $peek = true): array {
        if (empty($uids)) return [];
        $uidStr = implode(',', $uids);
        $fetchCmd = $peek ? 'BODY.PEEK[HEADER.FIELDS (FROM TO CC BCC SUBJECT DATE MESSAGE-ID IN-REPLY-TO REFERENCES)]' : 'BODY[HEADER.FIELDS (FROM TO CC BCC SUBJECT DATE MESSAGE-ID IN-REPL TO REFERENCES)]';
        $resp = $this->sendCommand("FETCH $uidStr ($fetchCmd FLAGS UID)");
        return $this->parseFetchHeaders($resp);
    }

    public function getMessageBody(int $uid, bool $peek = true): array {
        $bodyCmd = $peek ? 'BODY.PEEK[]' : 'BODY[]';
        $resp = $this->sendCommand("FETCH $uid ($bodyCmd UID)");
        return $this->parseFetchBody($resp);
    }

    public function getMessageHeaderRaw(int $uid): string {
        $resp = $this->sendCommand("FETCH $uid BODY.PEEK[HEADER]");
        return $this->extractFetchData($resp);
    }

    public function setFlag(int $uid, string $flag): bool {
        $resp = $this->sendCommand("STORE $uid +FLAGS (\\$flag)");
        return stripos($resp, 'OK') !== false;
    }

    public function unsetFlag(int $uid, string $flag): bool {
        $resp = $this->sendCommand("STORE $uid -FLAGS (\\$flag)");
        return stripos($resp, 'OK') !== false;
    }

    public function markAsRead(int $uid): bool { return $this->setFlag($uid, 'Seen'); }
    public function markAsUnread(int $uid): bool { return $this->unsetFlag($uid, 'Seen'); }
    public function markFlagged(int $uid): bool { return $this->setFlag($uid, 'Flagged'); }
    public function unmarkFlagged(int $uid): bool { return $this->unsetFlag($uid, 'Flagged'); }

    public function moveMessage(int $uid, string $folder): bool {
        $resp = $this->sendCommand("COPY $uid \"$folder\"");
        if (stripos($resp, 'OK') !== false) {
            $this->setFlag($uid, 'Deleted');
            $this->expunge();
            return true;
        }
        return false;
    }

    public function deleteMessage(int $uid): bool {
        $resp = $this->sendCommand("STORE $uid +FLAGS (\\Deleted)");
        if (stripos($resp, 'OK') !== false) {
            $this->expunge();
            return true;
        }
        return false;
    }

    public function expunge(): bool {
        $resp = $this->sendCommand('EXPUNGE');
        return true;
    }

    public function getMailboxSize(): array {
        $status = $this->sendCommand('STATUS INBOX (MESSAGES UNSEEN RECENT)');
        $info = ['messages' => 0, 'unseen' => 0, 'recent' => 0];
        if (preg_match('/MESSAGES\s+(\d+)/', $status, $m)) $info['messages'] = (int)$m[1];
        if (preg_match('/UNSEEN\s+(\d+)/', $status, $m)) $info['unseen'] = (int)$m[1];
        if (preg_match('/RECENT\s+(\d+)/', $status, $m)) $info['recent'] = (int)$m[1];
        return $info;
    }

    // ── Private helpers ──

    private function sendCommand(string $cmd): string {
        if (!$this->conn) throw new Exception("Not connected");
        $this->lastTag++;
        $tag = sprintf('A%04d', $this->lastTag);
        $full = "$tag $cmd\r\n";
        if ($this->debug) error_log("[IMAP SEND] $full");
        fwrite($this->conn, $full);
        return $this->readResponse($tag);
    }

    private function readResponse(?string $endTag = null): string {
        $response = '';
        $tagFound = false;
        $literalSize = 0;
        $inLiteral = false;

        while (!feof($this->conn)) {
            $line = fgets($this->conn, 8192);
            if ($line === false) break;
            if ($this->debug) error_log("[IMAP RECV] $line");

            if ($inLiteral) {
                $response .= $line;
                $literalSize -= strlen($line);
                if ($literalSize <= 0) {
                    $inLiteral = false;
                    $literalSize = 0;
                }
                continue;
            }

            $response .= $line;

            if (preg_match('/\{(\d+)\}\s*$/', rtrim($line), $m)) {
                $literalSize = (int)$m[1];
                $inLiteral = true;
                continue;
            }

            if ($endTag !== null && preg_match('/^' . preg_quote($endTag) . '\s+(OK|NO|BAD)/i', trim($line))) {
                $tagFound = true;
                break;
            }
            if ($endTag === null && preg_match('/^\*\s*(OK|NO|BAD)/i', trim($line))) {
                $tagFound = true;
                break;
            }
            if ($endTag === null && preg_match('/^([A-Z0-9]+)\s+(OK|NO|BAD)/i', trim($line))) {
                $tagFound = true;
                break;
            }
        }
        return $response;
    }

    private function parseSearchIds(string $resp): array {
        if (preg_match('/^\*\s+SEARCH\s+(.*)/mi', $resp, $m)) {
            $ids = array_filter(explode(' ', trim($m[1])));
            return array_map('intval', $ids);
        }
        return [];
    }

    private function parseFetchHeaders(string $resp): array {
        $messages = [];
        $blocks = preg_split('/^\*\s+(\d+)\s+FETCH/i', $resp, -1, PREG_SPLIT_DELIM_CAPTURE);
        for ($i = 1; $i < count($blocks); $i += 2) {
            $seqNum = (int)$blocks[$i];
            $body = $blocks[$i + 1] ?? '';
            $msg = ['seq' => $seqNum];

            if (preg_match('/UID\s+(\d+)/i', $body, $m)) $msg['uid'] = (int)$m[1];

            $flags = '';
            if (preg_match('/FLAGS\s+\(([^)]*)\)/i', $body, $m)) $flags = $m[1];
            $msg['seen'] = stripos($flags, '\\Seen') !== false;
            $msg['flagged'] = stripos($flags, '\\Flagged') !== false;

            $headerBlock = '';
            if (preg_match('/HEADER\.FIELDS[^)]*\]\s*\r?\n(.*?)(?=\r?\n[A-Z0-9]+\s|$)/is', $body, $m)) {
                $headerBlock = $m[1];
            } elseif (preg_match('/\{.*?\}\r?\n(.*)/s', $body, $m)) {
                $headerBlock = $m[1];
            }

            $msg['subject'] = $this->decodeHeader($this->extractHeader($headerBlock, 'Subject'));
            $msg['from'] = $this->parseAddress($this->extractHeader($headerBlock, 'From'));
            $msg['to'] = $this->parseAddressList($this->extractHeader($headerBlock, 'To'));
            $msg['cc'] = $this->parseAddressList($this->extractHeader($headerBlock, 'Cc'));
            $msg['date'] = $this->extractHeader($headerBlock, 'Date');
            $msg['message_id'] = trim($this->extractHeader($headerBlock, 'Message-ID'), '<> ');
            $msg['in_reply_to'] = trim($this->extractHeader($headerBlock, 'In-Reply-To'), '<> ');
            $refs = $this->extractHeader($headerBlock, 'References');
            $msg['references'] = $refs ? preg_replace('/[<>]/', '', $refs) : '';

            $messages[] = $msg;
        }
        return $messages;
    }

    private function parseFetchBody(string $resp): array {
        $result = ['uid' => 0, 'body' => ''];
        if (preg_match('/UID\s+(\d+)/i', $resp, $m)) $result['uid'] = (int)$m[1];

        $dataMatch = preg_match('/\{(\d+)\}\r?\n(.*)/s', $resp, $m);
        if ($dataMatch) {
            $expectedLen = (int)$m[1];
            $body = $m[2];
            while (strlen($body) < $expectedLen && !feof($this->conn)) {
                $body .= fread($this->conn, min(8192, $expectedLen - strlen($body)));
            }
            $result['body'] = $body;
        }
        return $result;
    }

    private function extractFetchData(string $resp): string {
        if (preg_match('/\{(\d+)\}\r?\n(.*)/s', $resp, $m)) {
            return trim($m[2]);
        }
        return '';
    }

    private function extractHeader(string $headers, string $name): string {
        $pattern = '/^' . preg_quote($name) . ':\s*(.*)/mi';
        if (preg_match($pattern, $headers, $m)) {
            return trim($m[1]);
        }
        return '';
    }

    private function decodeHeader(string $value): string {
        if (empty($value)) return '';
        $decoded = '';
        while (preg_match('/=\?([^?]+)\?([bqBQ])\?(.+?)\?=/s', $value, $m, PREG_OFFSET_CAPTURE)) {
            $decoded .= substr($value, 0, $m[0][1]);
            $charset = $m[1][0];
            $encoding = strtolower($m[2][0]);
            $encoded = $m[3][0];
            if ($encoding === 'b') {
                $decoded .= @iconv($charset, 'UTF-8', base64_decode($encoded)) ?: base64_decode($encoded);
            } else {
                $decoded .= @iconv($charset, 'UTF-8', quoted_printable_decode($encoded)) ?: quoted_printable_decode($encoded);
            }
            $value = substr($value, $m[0][1] + strlen($m[0][0]));
        }
        $decoded .= $value;
        return trim($decoded);
    }

    private function parseAddress(string $raw): array {
        $raw = trim($raw);
        if (empty($raw)) return ['nombre' => '', 'email' => ''];
        if (preg_match('/^(.+?)\s*<(.+?)>$/', $raw, $m)) {
            return ['nombre' => trim($m[1], '" '), 'email' => $m[2]];
        }
        if (preg_match('/<(.+?)>/', $raw, $m)) {
            return ['nombre' => '', 'email' => $m[1]];
        }
        return ['nombre' => '', 'email' => $raw];
    }

    private function parseAddressList(string $raw): array {
        $raw = trim($raw);
        if (empty($raw)) return [];
        $addresses = [];
        $parts = preg_split('/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/', $raw);
        foreach ($parts as $part) {
            $addr = $this->parseAddress(trim($part));
            if (!empty($addr['email'])) $addresses[] = $addr;
        }
        return $addresses;
    }
}
