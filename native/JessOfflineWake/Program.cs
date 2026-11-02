using System.Speech.Recognition;
using System.Text.Json;
using System.Text.RegularExpressions;

static void Emit(object value)
{
    Console.Out.WriteLine(JsonSerializer.Serialize(value));
    Console.Out.Flush();
}

var mode = "wake";
for (var i = 0; i < args.Length; i++)
{
    if (args[i] == "--mode" && i + 1 < args.Length)
    {
        mode = args[++i].Trim().ToLowerInvariant();
    }
}
if (mode is not ("wake" or "dictation"))
{
    Emit(new { type = "error", error = "Unsupported local speech mode." });
    Environment.ExitCode = 2;
    return;
}

try
{
    using var recognizer = new SpeechRecognitionEngine();
    recognizer.LoadGrammar(new DictationGrammar());
    recognizer.SetInputToDefaultAudioDevice();

    if (mode == "dictation")
    {
        recognizer.SpeechRecognized += (_, eventArgs) =>
        {
            var transcript = Regex.Replace(eventArgs.Result?.Text ?? string.Empty, @"\s+", " ").Trim();
            if (transcript.Length == 0) return;
            Emit(new
            {
                type = "dictation",
                transcript,
                confidence = Math.Round(eventArgs.Result?.Confidence ?? 0, 3),
                source = "Windows System.Speech local dictation"
            });
        };
    }
    else
    {
        var fired = 0;
        recognizer.SpeechRecognized += (_, eventArgs) =>
        {
            if (Interlocked.CompareExchange(ref fired, 0, 0) != 0) return;
            var transcript = Regex.Replace(eventArgs.Result?.Text ?? string.Empty, @"\s+", " ").Trim();
            if (transcript.Length == 0) return;
            var match = Regex.Match(transcript, @"^(?:(?:hey|hello|hi|okay|ok|yo)[\s,.:;!?-]+)?jess\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
            if (!match.Success) return;
            if (Interlocked.Exchange(ref fired, 1) != 0) return;
            var prompt = transcript[match.Length..].TrimStart(' ', ',', '.', ':', ';', '!', '?', '-');
            Emit(new { type = "wake", prompt, transcript, source = "Windows System.Speech offline recognizer" });
            try { recognizer.RecognizeAsyncCancel(); } catch { }
        };
    }

    recognizer.RecognizeAsync(RecognizeMode.Multiple);
    Emit(new
    {
        type = "ready",
        mode,
        source = mode == "dictation"
            ? "Windows System.Speech local dictation"
            : "Windows System.Speech offline recognizer"
    });
    await Task.Delay(Timeout.InfiniteTimeSpan);
}
catch (Exception ex)
{
    Emit(new { type = "error", error = ex.Message, mode });
    Console.Error.WriteLine(ex.Message);
    Environment.ExitCode = 2;
}