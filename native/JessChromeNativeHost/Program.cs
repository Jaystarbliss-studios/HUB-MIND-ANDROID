using System.Buffers.Binary;
using System.IO.Pipes;
using System.Text;
using System.Text.Json;

const int MaxMessageBytes = 1024 * 1024;
const string PipeName = "hubmind-jess-chrome-v1";
const string AllowedOrigin = "chrome-extension://baifedjcpcnkjjoikbafnkiombiaooai/";
if (args.Length < 1 || !string.Equals(args[0], AllowedOrigin, StringComparison.Ordinal))
{
    Console.Error.WriteLine("Rejected Chrome native host launch: extension origin did not match the registered Jess extension.");
    Environment.ExitCode = 2;
    return;
}
using var pipe = new NamedPipeClientStream(".", PipeName, PipeDirection.InOut, PipeOptions.Asynchronous);
try
{
    await pipe.ConnectAsync(10000);
}
catch (Exception ex)
{
    Console.Error.WriteLine($"Could not connect to the Hub-Mind named pipe '{PipeName}': {ex.Message}");
    Environment.ExitCode = 1;
    return;
}

using var nativeIn = Console.OpenStandardInput();
using var nativeOut = Console.OpenStandardOutput();
using var pipeReader = new StreamReader(pipe, new UTF8Encoding(false), false, 4096, leaveOpen: true);
using var pipeWriter = new StreamWriter(pipe, new UTF8Encoding(false), 4096, leaveOpen: true) { AutoFlush = true };
var tokenPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Jaystarbliss", "Hub-Mind", "JessChromeBridge", "bridge-token");
string bridgeToken;
try
{
    bridgeToken = (await File.ReadAllTextAsync(tokenPath)).Trim();
    if (bridgeToken.Length < 32) throw new InvalidDataException("Bridge token is missing or too short.");
}
catch (Exception ex)
{
    Console.Error.WriteLine($"Could not read the per-user Jess bridge token: {ex.Message}");
    Environment.ExitCode = 3;
    return;
}
await pipeWriter.WriteLineAsync(JsonSerializer.Serialize(new { type = "hello", token = bridgeToken }));
var acknowledgement = await pipeReader.ReadLineAsync();
if (string.IsNullOrWhiteSpace(acknowledgement))
{
    Console.Error.WriteLine("Hub-Mind named pipe closed before acknowledging the native-host handshake.");
    Environment.ExitCode = 4;
    return;
}
try
{
    using var document = JsonDocument.Parse(acknowledgement);
    if (!document.RootElement.TryGetProperty("type", out var ackType) || ackType.GetString() != "hello-ack")
    {
        Console.Error.WriteLine("Hub-Mind returned an invalid native-host handshake acknowledgement.");
        Environment.ExitCode = 4;
        return;
    }
}
catch (Exception ex)
{
    Console.Error.WriteLine($"Could not parse the Hub-Mind native-host handshake acknowledgement: {ex.Message}");
    Environment.ExitCode = 4;
    return;
}
using var stop = new CancellationTokenSource();

var fromChrome = PumpNativeMessagesToPipeAsync(nativeIn, pipeWriter, stop.Token);
var fromApp = PumpPipeMessagesToChromeAsync(pipeReader, nativeOut, stop.Token);
await Task.WhenAny(fromChrome, fromApp);
stop.Cancel();
try { await Task.WhenAll(fromChrome, fromApp); }
catch (Exception ex) when (ex is not OperationCanceledException)
{
    Console.Error.WriteLine($"Jess Chrome native-messaging bridge stopped: {ex.Message}");
}
Environment.ExitCode = 0;

static async Task PumpNativeMessagesToPipeAsync(Stream input, StreamWriter pipeWriter, CancellationToken cancellationToken)
{
    var header = new byte[4];
    while (!cancellationToken.IsCancellationRequested)
    {
        await ReadExactlyAsync(input, header, cancellationToken);
        var length = BinaryPrimitives.ReadUInt32LittleEndian(header);
        if (length < 2 || length > MaxMessageBytes) throw new InvalidDataException("Invalid Chrome native message length.");
        var payload = new byte[(int)length];
        await ReadExactlyAsync(input, payload, cancellationToken);
        var json = Encoding.UTF8.GetString(payload);
        await pipeWriter.WriteLineAsync(json.AsMemory(), cancellationToken);
    }
}

static async Task PumpPipeMessagesToChromeAsync(StreamReader pipeReader, Stream output, CancellationToken cancellationToken)
{
    while (!cancellationToken.IsCancellationRequested)
    {
        var line = await pipeReader.ReadLineAsync(cancellationToken);
        if (line is null) break;
        var payload = Encoding.UTF8.GetBytes(line);
        if (payload.Length < 2 || payload.Length > MaxMessageBytes) throw new InvalidDataException("Invalid app bridge message length.");
        var header = new byte[4];
        BinaryPrimitives.WriteUInt32LittleEndian(header, (uint)payload.Length);
        await output.WriteAsync(header, cancellationToken);
        await output.WriteAsync(payload, cancellationToken);
        await output.FlushAsync(cancellationToken);
    }
}

static async Task ReadExactlyAsync(Stream stream, byte[] buffer, CancellationToken cancellationToken)
{
    var offset = 0;
    while (offset < buffer.Length)
    {
        var read = await stream.ReadAsync(buffer.AsMemory(offset), cancellationToken);
        if (read == 0) throw new EndOfStreamException();
        offset += read;
    }
}
