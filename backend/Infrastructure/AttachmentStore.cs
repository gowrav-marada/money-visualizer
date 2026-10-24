namespace MoneyVisualizer.Api.Infrastructure;

/// <summary>Stores uploaded receipts and proofs on disk under generated names; original names are kept only as metadata.</summary>
public sealed class AttachmentStore(IConfiguration configuration, IWebHostEnvironment environment)
{
    private static readonly Dictionary<string, string> AllowedTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        [".pdf"] = "application/pdf",
        [".png"] = "image/png",
        [".jpg"] = "image/jpeg",
        [".jpeg"] = "image/jpeg",
        [".webp"] = "image/webp"
    };

    public long MaxBytes => configuration.GetValue<long?>("Attachments:MaxBytes") ?? 5 * 1024 * 1024;

    private string Root
    {
        get
        {
            var configured = configuration["Attachments:Path"] ?? "App_Data/attachments";
            var root = Path.IsPathRooted(configured) ? configured : Path.Combine(environment.ContentRootPath, configured);
            Directory.CreateDirectory(root);
            return root;
        }
    }

    public string ValidateAndGetContentType(IFormFile file)
    {
        if (file.Length == 0)
            throw new BusinessRuleException("The selected file is empty.");
        if (file.Length > MaxBytes)
            throw new BusinessRuleException($"Files must be smaller than {MaxBytes / (1024 * 1024)} MB.");

        var extension = Path.GetExtension(file.FileName);
        if (!AllowedTypes.TryGetValue(extension, out var contentType))
            throw new BusinessRuleException("Only PDF, PNG, JPG and WEBP files are allowed.");
        return contentType;
    }

    public async Task<string> SaveAsync(Guid userId, IFormFile file, CancellationToken cancellationToken)
    {
        var folder = Path.Combine(Root, userId.ToString("N"));
        Directory.CreateDirectory(folder);
        var relative = Path.Combine(userId.ToString("N"), $"{Guid.NewGuid():N}{Path.GetExtension(file.FileName).ToLowerInvariant()}");
        await using var stream = File.Create(Path.Combine(Root, relative));
        await file.CopyToAsync(stream, cancellationToken);
        return relative;
    }

    public string ResolvePath(string relative)
    {
        var full = Path.GetFullPath(Path.Combine(Root, relative));
        if (!full.StartsWith(Path.GetFullPath(Root), StringComparison.OrdinalIgnoreCase))
            throw new BusinessRuleException("Invalid attachment path.");
        return full;
    }

    public void Delete(string relative)
    {
        var path = ResolvePath(relative);
        if (File.Exists(path))
            File.Delete(path);
    }

    public void DeleteAllFor(Guid userId)
    {
        var folder = Path.Combine(Root, userId.ToString("N"));
        if (Directory.Exists(folder))
            Directory.Delete(folder, recursive: true);
    }
}
