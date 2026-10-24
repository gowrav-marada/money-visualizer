namespace MoneyVisualizer.Api.Modules.Email;

public static class EmailServiceCollectionExtensions
{
    public static IServiceCollection AddEmailIntegration(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddHttpClient<OutlookMailClient>().AddStandardResilienceHandler();
        services.AddHttpClient<GmailMailClient>().AddStandardResilienceHandler();
        services.AddTransient<IMailboxClient>(provider => provider.GetRequiredService<OutlookMailClient>());
        services.AddTransient<IMailboxClient>(provider => provider.GetRequiredService<GmailMailClient>());
        services.AddScoped<EmailImportService>();
        return services;
    }
}
