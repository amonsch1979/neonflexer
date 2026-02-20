# Simple PowerShell HTTP server for MAGICTOOLBOX NEONFLEXER
# No external tools required - works on any Windows 10/11

$port = 8080
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

Write-Host "Server running at http://localhost:$port/"
Write-Host "Serving files from: $root"
Write-Host "Press Ctrl+C to stop."
Write-Host ""

$mimeTypes = @{
    '.html' = 'text/html'
    '.css'  = 'text/css'
    '.js'   = 'application/javascript'
    '.json' = 'application/json'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.svg'  = 'image/svg+xml'
    '.gif'  = 'image/gif'
    '.ico'  = 'image/x-icon'
    '.glb'  = 'model/gltf-binary'
    '.gltf' = 'model/gltf+json'
    '.woff' = 'font/woff'
    '.woff2'= 'font/woff2'
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $urlPath = $request.Url.LocalPath
        if ($urlPath -eq '/') { $urlPath = '/index.html' }

        $filePath = Join-Path $root ($urlPath -replace '/', '\')

        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { 'application/octet-stream' }

            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentType = $contentType
            $response.ContentLength64 = $bytes.Length
            $response.StatusCode = 200
            $response.OutputStream.Write($bytes, 0, $bytes.Length)

            Write-Host "$($request.HttpMethod) $urlPath -> 200 ($contentType)"
        } else {
            $response.StatusCode = 404
            $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.OutputStream.Write($msg, 0, $msg.Length)
            Write-Host "$($request.HttpMethod) $urlPath -> 404"
        }

        $response.OutputStream.Close()
    }
} finally {
    $listener.Stop()
}
