<?php
declare(strict_types=1);
require __DIR__ . '/runtime/updater.php';

function reply(int $code, array $value): never {
    http_response_code($code); header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff'); echo json_encode($value, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR); exit;
}
try {
    $updater = new PadelLocalUpdater(__DIR__);
    $base = rtrim(str_replace('\\', '/', rawurldecode(dirname($_SERVER['SCRIPT_NAME']))), '/');
    $uri = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/');
    $path = substr($uri, strlen($base));
    $local = in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);
    $host = strtolower($_SERVER['HTTP_HOST'] ?? '');
    $localHost = preg_match('/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/D', $host) === 1;
    if (str_starts_with($path, '/__local-update/')) {
        if (!$local || !$localHost) reply(403, ['error'=>'La actualización debe iniciarse desde localhost.']);
        $action = substr($path, strlen('/__local-update/'));
        if ($action === 'status' && $_SERVER['REQUEST_METHOD'] === 'GET') reply(200, $updater->status());
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') reply(405, ['error'=>'Método no permitido.']);
        $scheme = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http';
        if (($_SERVER['HTTP_ORIGIN'] ?? '') !== $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? '')
            || !hash_equals($updater->status()['token'], $_SERVER['HTTP_X_LOCAL_UPDATE_TOKEN'] ?? '')
            || !str_starts_with($_SERVER['CONTENT_TYPE'] ?? '', 'application/json')) reply(403, ['error'=>'La acción debe iniciarse desde la app local.']);
        $body = file_get_contents('php://input', false, null, 0, 1025);
        if (strlen($body) > 1024) reply(413, ['error'=>'Solicitud demasiado grande.']);
        $input = json_decode($body ?: '{}', true, 32, JSON_THROW_ON_ERROR);
        if ($action === 'check') { $updater->update(false, true); reply(200, $updater->status()); }
        if ($action === 'apply') { $ok = $updater->update(true, false, $input['version'] ?? ''); reply($ok ? 200 : 409, $updater->status()); }
        reply(404, ['error'=>'Acción inexistente.']);
    }
    if (!in_array($_SERVER['REQUEST_METHOD'], ['GET','HEAD'], true)) { http_response_code(405); exit; }
    if (preg_match('~^/(\.local-updates|runtime|app)(/|$)~', $path)) { http_response_code(403); exit; }
    $document = $path === '' || $path === '/' || in_array($path, ['/index.html','/index.php'], true) || pathinfo($path, PATHINFO_EXTENSION) === '';
    if ($document && $local && $localHost) $updater->update(true);
    $file = $updater->file($document ? '/index.html' : $path);
    if (!$file) { http_response_code(404); exit; }
    $extension = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    $types = ['html'=>'text/html; charset=utf-8','js'=>'text/javascript; charset=utf-8','css'=>'text/css; charset=utf-8','json'=>'application/json','png'=>'image/png','jpg'=>'image/jpeg','jpeg'=>'image/jpeg','jfif'=>'image/jpeg','svg'=>'image/svg+xml','ico'=>'image/x-icon','webp'=>'image/webp','woff'=>'font/woff','woff2'=>'font/woff2','ttf'=>'font/ttf'];
    header('Content-Type: ' . ($types[$extension] ?? 'application/octet-stream')); header('Cache-Control: no-store'); header('X-Content-Type-Options: nosniff');
    header('X-Local-App-Version: ' . $updater->status()['active']['version']);
    if ($_SERVER['REQUEST_METHOD'] === 'HEAD') exit;
    if ($document) {
        $encodedBase = '/' . implode('/', array_map('rawurlencode', array_filter(explode('/', $base), 'strlen'))) . '/';
        if ($encodedBase === '//') $encodedBase = '/';
        $tag = '<base href="' . htmlspecialchars($encodedBase, ENT_QUOTES, 'UTF-8') . '"><meta name="local-update-base" content="' . htmlspecialchars($encodedBase, ENT_QUOTES, 'UTF-8') . '">';
        echo preg_replace('/<head(\s[^>]*)?>/i', '$0' . $tag, file_get_contents($file), 1);
    } else readfile($file);
} catch (Throwable $error) {
    error_log('Padel Center local updater: ' . $error->getMessage());
    reply(500, ['error'=>'No se pudo iniciar el acceso local. Revisá los permisos de la carpeta del sistema.']);
}
