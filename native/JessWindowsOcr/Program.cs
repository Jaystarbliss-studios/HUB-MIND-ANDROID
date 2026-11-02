using System.Text.Json;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;
using Windows.Storage.Streams;

static void Emit(object value)
{
    Console.Out.WriteLine(JsonSerializer.Serialize(value));
    Console.Out.Flush();
}

if (args.Length != 1 || !File.Exists(args[0]))
{
    Emit(new { ok = false, error = "Provide the path to an existing screenshot image." });
    Environment.ExitCode = 2;
    return;
}

try
{
    var bytes = await File.ReadAllBytesAsync(args[0]);
    using var stream = new InMemoryRandomAccessStream();
    using (var writer = new DataWriter(stream))
    {
        writer.WriteBytes(bytes);
        await writer.StoreAsync();
        await writer.FlushAsync();
        writer.DetachStream();
    }
    stream.Seek(0);
    var decoder = await BitmapDecoder.CreateAsync(stream);
    using var bitmap = await decoder.GetSoftwareBitmapAsync();
    var engine = OcrEngine.TryCreateFromUserProfileLanguages();
    if (engine is null)
    {
        Emit(new { ok = false, error = "Windows OCR is unavailable because no supported OCR language is installed." });
        Environment.ExitCode = 3;
        return;
    }
    var result = await engine.RecognizeAsync(bitmap);
    var text = result.Text ?? string.Empty;
    Emit(new { ok = !string.IsNullOrWhiteSpace(text), text, lineCount = result.Lines.Count, source = "Windows.Media.Ocr", width = bitmap.PixelWidth, height = bitmap.PixelHeight });
    if (string.IsNullOrWhiteSpace(text)) Environment.ExitCode = 4;
}
catch (Exception ex)
{
    Emit(new { ok = false, error = ex.Message });
    Environment.ExitCode = 1;
}
