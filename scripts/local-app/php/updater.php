<?php
declare(strict_types=1);

final class PadelLocalUpdater
{
    public const SOURCE = 'https://padelcenter.netlify.app/';
    private const PROJECT = 'zcixnnzxxkylotbjudhk';
    private string $root;
    private string $storage;
    private string $source;
    private int $timeout;
    private int $interval;
    private array $active;
    private ?string $previous = null;
    private ?string $updatedAt = null;
    private array $feed = [];
    private string $token;

    public function __construct(string $root, string $source = self::SOURCE, int $timeout = 30, int $interval = 60)
    {
        $this->root = rtrim($root, '/\\');
        $this->storage = $this->root . '/.local-updates';
        $this->source = rtrim($source, '/') . '/';
        $parts = parse_url($source);
        if (($parts['scheme'] ?? '') !== 'https' && !in_array($parts['host'] ?? '', ['127.0.0.1', 'localhost'], true)) {
            throw new RuntimeException('Origen de actualización inválido.');
        }
        $this->timeout = $timeout; $this->interval = $interval;
        if (!is_dir($this->storage . '/releases') && !@mkdir($this->storage . '/releases', 0775, true) && !is_dir($this->storage . '/releases')) {
            throw new RuntimeException('El servidor necesita permiso de escritura en la carpeta del sistema.');
        }
        $tokenFile = $this->storage . '/token';
        if (!is_file($tokenFile)) {
            $lock = fopen($this->storage . '/lock', 'c+');
            if (!$lock || !flock($lock, LOCK_EX)) throw new RuntimeException('No se pudo iniciar el actualizador.');
            try { if (!is_file($tokenFile)) $this->writeFile($tokenFile, bin2hex(random_bytes(32))); }
            finally { flock($lock, LOCK_UN); fclose($lock); }
        }
        $this->token = trim((string) file_get_contents($tokenFile));
        $this->restore();
        try { $this->feed = $this->readJson($this->storage . '/feed.json'); } catch (Throwable $error) { $this->feed = []; }
    }

    private function readJson(string $path): array
    {
        $text = @file_get_contents($path);
        if ($text === false) throw new RuntimeException('Archivo local no disponible.');
        $value = json_decode($text, true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($value)) throw new RuntimeException('Archivo local inválido.');
        return $value;
    }
    private function writeFile(string $path, string $data): void
    {
        if (file_put_contents($path, $data, LOCK_EX) !== strlen($data)) throw new RuntimeException('No se pudo guardar la actualización.');
    }
    private function writeJson(string $path, array $data): void
    {
        $temporary = $this->storage . '/write-' . bin2hex(random_bytes(12)) . '.tmp';
        $this->writeFile($temporary, json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));
        for ($attempt = 0; $attempt < 5; $attempt++) {
            if (@rename($temporary, $path)) return;
            usleep(100000);
        }
        @unlink($temporary);
        throw new RuntimeException('No se pudo activar la actualización. Se conserva la versión anterior.');
    }
    public static function validPath(string $path): bool
    {
        if ($path === '' || $path[0] !== '/' || preg_match('~[\\\\%?#:\x00-\x1f<>"|*]~', $path)) return false;
        foreach (explode('/', substr($path, 1)) as $part) {
            if ($part === '' || $part[0] === '.' || preg_match('/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i', $part)) return false;
        }
        return in_array(strtolower(pathinfo($path, PATHINFO_EXTENSION)), ['html','js','css','json','png','jpg','jpeg','jfif','svg','webp','ico','woff','woff2','ttf','eot','webmanifest'], true);
    }
    private function validate(array $manifest): array
    {
        if (($manifest['protocol'] ?? null) !== 1 || ($manifest['app'] ?? '') !== 'padel-center'
            || ($manifest['project'] ?? '') !== self::PROJECT || !preg_match('/^[a-zA-Z0-9-]{8,100}$/D', $manifest['version'] ?? '')
            || !is_string($manifest['publishedAt'] ?? null) || strtotime($manifest['publishedAt']) === false
            || !is_array($manifest['files'] ?? null) || count($manifest['files']) < 1 || count($manifest['files']) > 500
            || !is_array($manifest['notes'] ?? null) || count($manifest['notes']) > 20) {
            throw new RuntimeException('La versión publicada no es compatible con Padel Center.');
        }
        foreach ($manifest['notes'] as $note) if (!is_string($note) || strlen($note) > 2000) throw new RuntimeException('Novedades de actualización inválidas.');
        $paths = []; $total = 0; $hasScript = false;
        foreach ($manifest['files'] as $file) {
            $path = $file['path'] ?? '';
            if (!is_string($path) || !self::validPath($path) || $path === '/local-update.json' || isset($paths[strtolower($path)])
                || !preg_match('/^[a-f0-9]{64}$/D', $file['sha256'] ?? '') || !is_int($file['size'] ?? null)
                || $file['size'] < 0 || $file['size'] > 20 * 1024 * 1024) throw new RuntimeException('Lista de archivos de actualización inválida.');
            $paths[strtolower($path)] = true; $total += $file['size'];
            if (str_starts_with($path, '/assets/') && str_ends_with($path, '.js')) $hasScript = true;
        }
        if (!isset($paths['/index.html']) || !$hasScript || $total > 100 * 1024 * 1024) throw new RuntimeException('La actualización está incompleta.');
        return $manifest;
    }
    private function directory(string $name): string
    {
        if ($name === 'bundled') return $this->root . '/app';
        if (!preg_match('/^[a-f0-9-]{36}$/D', $name)) throw new RuntimeException('Versión local inválida.');
        return $this->storage . '/releases/' . $name;
    }
    private function verify(string $directory, array $manifest): void
    {
        $project = false; $version = false; $html = ''; $paths = [];
        foreach ($manifest['files'] as $file) {
            $path = $directory . $file['path'];
            if (!is_file($path) || filesize($path) !== $file['size'] || hash_file('sha256', $path) !== $file['sha256']) throw new RuntimeException('Una versión local está incompleta.');
            $paths[$file['path']] = true;
            if (str_ends_with($path, '.js')) {
                $js = file_get_contents($path);
                $project = $project || str_contains($js, self::PROJECT);
                $version = $version || str_contains($js, $manifest['version']);
            }
            if ($file['path'] === '/index.html') $html = file_get_contents($path);
        }
        preg_match_all('~(?:src|href)=["\']\.?/?(assets/[^"\']+)["\']~', $html, $refs);
        if (!$project || !$version || !$refs[1]) throw new RuntimeException('La versión descargada no corresponde al sistema.');
        foreach ($refs[1] as $ref) if (!isset($paths['/' . $ref])) throw new RuntimeException('Faltan archivos de la app.');
    }
    private function load(string $name, bool $verify = true): array
    {
        $directory = $this->directory($name);
        $manifest = $this->validate($this->readJson($directory . '/local-update.json'));
        if ($verify) $this->verify($directory, $manifest);
        return ['name' => $name, 'directory' => $directory, 'manifest' => $manifest];
    }
    private function restore(): void
    {
        $bundled = $this->load('bundled'); $this->active = $bundled;
        $this->previous = null; $this->updatedAt = null;
        try {
            $state = $this->readJson($this->storage . '/state.json');
            $this->previous = $state['previousDir'] ?? null;
            try { $this->active = $this->load($state['activeDir']); $this->updatedAt = $state['updatedAt'] ?? null; }
            catch (Throwable $error) {
                try { $this->active = $this->load($this->previous ?? 'bundled'); } catch (Throwable $ignored) { $this->active = $bundled; }
            }
        } catch (Throwable $error) { /* The verified bundled copy is the initial fallback. */ }
    }
    private function summary(array $manifest): array
    {
        return array_intersect_key($manifest, array_flip(['version','publishedAt','notes']));
    }
    public function status(): array
    {
        $latest = null;
        try { if (isset($this->feed['latest'])) $latest = $this->summary($this->validate($this->feed['latest'])); } catch (Throwable $error) { /* Ignore invalid metadata. */ }
        $phase = $this->feed['phase'] ?? 'idle';
        if (in_array($phase, ['checking','downloading'], true) && time() - ($this->feed['changedAt'] ?? 0) > $this->timeout + 10) $phase = 'error';
        return ['protocol'=>1, 'app'=>'padel-center', 'active'=>$this->summary($this->active['manifest']), 'latest'=>$latest,
            'phase'=>$phase, 'lastError'=>$this->feed['lastError'] ?? null, 'updatedAt'=>$this->updatedAt, 'token'=>$this->token];
    }
    private function phase(string $phase, ?string $error = null): void
    {
        $this->feed['phase'] = $phase; $this->feed['lastError'] = $error; $this->feed['changedAt'] = time();
        $this->writeJson($this->storage . '/feed.json', $this->feed);
    }
    private function fetch(string $path, int $maximum, float $deadline): string
    {
        $handle = curl_init($this->source . $path); $data = '';
        curl_setopt_array($handle, [CURLOPT_FOLLOWLOCATION=>false, CURLOPT_CONNECTTIMEOUT=>5,
            CURLOPT_TIMEOUT=>max(1, (int) ceil($deadline - microtime(true))), CURLOPT_SSL_VERIFYPEER=>true,
            CURLOPT_SSL_VERIFYHOST=>2, CURLOPT_PROTOCOLS=>CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_HTTPHEADER=>['Cache-Control: no-cache'], CURLOPT_WRITEFUNCTION=>static function ($curl, string $chunk) use (&$data, $maximum): int {
                if (strlen($data) + strlen($chunk) > $maximum) return 0;
                $data .= $chunk; return strlen($chunk);
            }]);
        $ok = curl_exec($handle); $code = curl_getinfo($handle, CURLINFO_HTTP_CODE); curl_close($handle);
        if (!$ok || $code !== 200 || microtime(true) > $deadline) throw new RuntimeException('No se pudo descargar la actualización completa. Se conserva la versión actual.');
        return $data;
    }
    private function download(array $manifest, float $deadline): void
    {
        $hex = bin2hex(random_bytes(16));
        $id = substr($hex,0,8).'-'.substr($hex,8,4).'-'.substr($hex,12,4).'-'.substr($hex,16,4).'-'.substr($hex,20,12);
        $directory = $this->directory($id); $activated = false;
        if (!mkdir($directory, 0775)) throw new RuntimeException('No se pudo preparar la actualización.');
        try {
            $this->phase('downloading');
            foreach ($manifest['files'] as $file) {
                $url = implode('/', array_map('rawurlencode', explode('/', ltrim($file['path'], '/'))));
                $data = $this->fetch($url, $file['size'], $deadline);
                if (strlen($data) !== $file['size'] || hash('sha256', $data) !== $file['sha256']) throw new RuntimeException('La descarga está incompleta. Se conserva la versión anterior.');
                $path = $directory . $file['path'];
                if (!is_dir(dirname($path))) mkdir(dirname($path), 0775, true);
                $this->writeFile($path, $data);
            }
            $this->verify($directory, $manifest);
            $this->writeFile($directory . '/local-update.json', json_encode($manifest, JSON_THROW_ON_ERROR));
            $time = gmdate('c');
            $this->writeJson($this->storage . '/state.json', ['activeDir'=>$id, 'previousDir'=>$this->active['name'], 'updatedAt'=>$time]);
            $this->previous = $this->active['name']; $this->updatedAt = $time;
            $this->active = ['name'=>$id,'directory'=>$directory,'manifest'=>$manifest]; $activated = true;
        } finally {
            if (!$activated && realpath(dirname($directory)) === realpath($this->storage . '/releases') && basename($directory) === $id) {
                $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($directory, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
                foreach ($files as $file) { if ($file->isDir() && !$file->isLink()) @rmdir($file->getPathname()); else @unlink($file->getPathname()); }
                unset($files); @rmdir($directory);
            }
        }
    }
    public function update(bool $autoApply = false, bool $force = false, ?string $expected = null): bool
    {
        $lock = fopen($this->storage . '/lock', 'c+');
        if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) { if ($lock) fclose($lock); return false; }
        try {
            $this->restore();
            try { $this->feed = $this->readJson($this->storage . '/feed.json'); } catch (Throwable $ignored) { $this->feed = []; }
            $deadline = microtime(true) + $this->timeout;
            if ($expected === null && ($force || time() - ($this->feed['checkedAt'] ?? 0) >= $this->interval)) {
                $this->phase('checking');
                $this->feed['latest'] = $this->validate(json_decode($this->fetch('local-update.json?check=' . time(), 1024 * 1024, $deadline), true, 512, JSON_THROW_ON_ERROR));
                $this->feed['checkedAt'] = time();
            }
            $latest = isset($this->feed['latest']) ? $this->validate($this->feed['latest']) : null;
            if ($expected !== null && (!$latest || $latest['version'] !== $expected)) throw new RuntimeException('La versión disponible cambió. Volvé a buscar actualizaciones.');
            if ($latest && $latest['version'] !== $this->active['manifest']['version']) {
                if ($autoApply) $this->download($latest, $deadline); else { $this->phase('available'); return true; }
            }
            $this->phase('idle'); return true;
        } catch (Throwable $error) {
            try { $this->phase('error', $error->getMessage()); } catch (Throwable $ignored) { /* The active pointer remains intact. */ }
            return false;
        } finally { flock($lock, LOCK_UN); fclose($lock); }
    }
    public function file(string $path): ?string
    {
        if (!self::validPath($path)) return null;
        $names = array_unique(array_filter([$this->active['name'], $this->previous, 'bundled', ...array_map('basename', glob($this->storage . '/releases/*', GLOB_ONLYDIR) ?: [])]));
        foreach ($names as $name) {
            try {
                $release = $name === $this->active['name'] ? $this->active : $this->load($name, false);
                foreach ($release['manifest']['files'] as $file) if ($file['path'] === $path && is_file($release['directory'] . $path)) return $release['directory'] . $path;
            } catch (Throwable $ignored) { /* Ignore partial or invalid releases. */ }
        }
        return null;
    }
}
