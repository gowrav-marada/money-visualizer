using Microsoft.EntityFrameworkCore;
using MoneyVisualizer.Api.Data;
using MoneyVisualizer.Api.Domain;
using MoneyVisualizer.Api.Infrastructure;

namespace MoneyVisualizer.Api.Modules.Settings;

public sealed partial class SettingsService(MoneyDbContext database)
{
    private ApplicationSetting? cached;

    public async Task<ApplicationSetting> GetAsync(CancellationToken cancellationToken = default)
    {
        if (cached is not null)
            return cached;

        cached = await database.ApplicationSettings.FirstOrDefaultAsync(cancellationToken);
        if (cached is null)
        {
            cached = new ApplicationSetting();
            database.ApplicationSettings.Add(cached);
            await database.SaveChangesAsync(cancellationToken);
        }

        return cached;
    }

    public async Task<DateOnly> TodayAsync(CancellationToken cancellationToken = default) =>
        DateHelper.TodayIn((await GetAsync(cancellationToken)).TimeZone);
}
