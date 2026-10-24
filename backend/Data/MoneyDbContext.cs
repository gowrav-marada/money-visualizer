using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using MoneyVisualizer.Api.Domain;
using MoneyVisualizer.Api.Infrastructure;

namespace MoneyVisualizer.Api.Data;

public sealed class MoneyDbContext(DbContextOptions<MoneyDbContext> options, CurrentUser currentUser) : DbContext(options)
{
    private static readonly HashSet<Type> AuditedTypes =
    [
        typeof(PersonalTransaction), typeof(ReceivablePayable), typeof(Settlement),
        typeof(Bill), typeof(BillPayment), typeof(RecurringTransaction)
    ];

    private Guid UserId => currentUser.UserId;

    public DbSet<User> Users => Set<User>();
    public DbSet<Person> People => Set<Person>();
    public DbSet<Account> Accounts => Set<Account>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<PersonalTransaction> PersonalTransactions => Set<PersonalTransaction>();
    public DbSet<RecurringTransaction> RecurringTransactions => Set<RecurringTransaction>();
    public DbSet<ReceivablePayable> ReceivablePayables => Set<ReceivablePayable>();
    public DbSet<Settlement> Settlements => Set<Settlement>();
    public DbSet<Bill> Bills => Set<Bill>();
    public DbSet<BillPayment> BillPayments => Set<BillPayment>();
    public DbSet<EmailConnection> EmailConnections => Set<EmailConnection>();
    public DbSet<EmailImport> EmailImports => Set<EmailImport>();
    public DbSet<Attachment> Attachments => Set<Attachment>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<ApplicationSetting> ApplicationSettings => Set<ApplicationSetting>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Properties<decimal>().HavePrecision(18, 2);
        configurationBuilder.Properties<Enum>().HaveConversion<string>().HaveMaxLength(32);
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>().HasIndex(user => user.ExternalId).IsUnique();

        // Every owned entity is scoped to the current user so one user can never read another user's data.
        ApplyUserFilter<Person>(modelBuilder);
        ApplyUserFilter<Account>(modelBuilder);
        ApplyUserFilter<Category>(modelBuilder);
        ApplyUserFilter<PersonalTransaction>(modelBuilder);
        ApplyUserFilter<RecurringTransaction>(modelBuilder);
        ApplyUserFilter<ReceivablePayable>(modelBuilder);
        ApplyUserFilter<Settlement>(modelBuilder);
        ApplyUserFilter<Bill>(modelBuilder);
        ApplyUserFilter<BillPayment>(modelBuilder);
        ApplyUserFilter<EmailConnection>(modelBuilder);
        ApplyUserFilter<EmailImport>(modelBuilder);
        ApplyUserFilter<Attachment>(modelBuilder);
        ApplyUserFilter<Notification>(modelBuilder);
        ApplyUserFilter<ApplicationSetting>(modelBuilder);

        modelBuilder.Entity<Person>().HasIndex(person => new { person.UserId, person.Name }).IsUnique();
        modelBuilder.Entity<Category>().HasIndex(category => new { category.UserId, category.Kind, category.Name }).IsUnique();
        modelBuilder.Entity<ApplicationSetting>().HasIndex(setting => setting.UserId).IsUnique();
        modelBuilder.Entity<EmailConnection>().HasIndex(connection => new { connection.UserId, connection.Provider }).IsUnique();
        modelBuilder.Entity<EmailImport>().HasIndex(import => new { import.UserId, import.Provider, import.MessageId }).IsUnique();
        modelBuilder.Entity<Notification>().HasIndex(notification => new { notification.UserId, notification.DedupKey }).IsUnique();
        modelBuilder.Entity<PersonalTransaction>().HasIndex(transaction => new { transaction.UserId, transaction.Date });
        modelBuilder.Entity<Bill>().HasIndex(bill => new { bill.UserId, bill.DueDate });
        modelBuilder.Entity<AuditLog>().HasIndex(log => new { log.UserId, log.EntityId });

        modelBuilder.Entity<PersonalTransaction>()
            .HasOne(transaction => transaction.Category).WithMany().HasForeignKey(transaction => transaction.CategoryId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<PersonalTransaction>()
            .HasOne(transaction => transaction.Account).WithMany().HasForeignKey(transaction => transaction.AccountId).OnDelete(DeleteBehavior.SetNull);
        modelBuilder.Entity<ReceivablePayable>()
            .HasOne(record => record.Person).WithMany().HasForeignKey(record => record.PersonId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<ReceivablePayable>()
            .HasMany(record => record.Settlements).WithOne().HasForeignKey(settlement => settlement.ReceivablePayableId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<Bill>()
            .HasMany(bill => bill.Payments).WithOne().HasForeignKey(payment => payment.BillId).OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<ReceivablePayable>().Ignore(record => record.Remaining);
        modelBuilder.Entity<Bill>().Ignore(bill => bill.Unpaid);
    }

    private void ApplyUserFilter<T>(ModelBuilder modelBuilder) where T : OwnedEntity =>
        modelBuilder.Entity<T>().HasQueryFilter(entity => entity.UserId == UserId);

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        StampAndAudit();
        return base.SaveChangesAsync(cancellationToken);
    }

    public override int SaveChanges()
    {
        StampAndAudit();
        return base.SaveChanges();
    }

    private void StampAndAudit()
    {
        var now = DateTime.UtcNow;
        var audits = new List<AuditLog>();
        foreach (var entry in ChangeTracker.Entries<OwnedEntity>().ToList())
        {
            if (entry.State == EntityState.Added)
            {
                if (entry.Entity.UserId == Guid.Empty)
                    entry.Entity.UserId = UserId;
                entry.Entity.CreatedAt = now;
                entry.Entity.UpdatedAt = now;
            }
            else if (entry.State == EntityState.Modified)
            {
                entry.Entity.UpdatedAt = now;
            }

            if (AuditedTypes.Contains(entry.Entity.GetType()) && entry.State is EntityState.Added or EntityState.Modified or EntityState.Deleted)
                audits.Add(BuildAudit(entry, now));
        }

        AuditLogs.AddRange(audits);
    }

    private static AuditLog BuildAudit(EntityEntry<OwnedEntity> entry, DateTime now)
    {
        var action = entry.State switch
        {
            EntityState.Added => AuditAction.Created,
            EntityState.Deleted => AuditAction.Deleted,
            _ => AuditAction.Updated
        };

        var changes = new Dictionary<string, object?>();
        foreach (var property in entry.Properties)
        {
            var name = property.Metadata.Name;
            if (name is nameof(OwnedEntity.UpdatedAt) or nameof(OwnedEntity.CreatedAt) or nameof(OwnedEntity.UserId))
                continue;

            if (action == AuditAction.Updated)
            {
                if (property.IsModified && !Equals(property.OriginalValue, property.CurrentValue))
                    changes[name] = new { from = property.OriginalValue, to = property.CurrentValue };
            }
            else
            {
                changes[name] = action == AuditAction.Deleted ? property.OriginalValue : property.CurrentValue;
            }
        }

        return new AuditLog
        {
            UserId = entry.Entity.UserId,
            EntityType = entry.Entity.GetType().Name,
            EntityId = entry.Entity.Id,
            Action = action,
            Changes = JsonSerializer.Serialize(changes),
            At = now
        };
    }
}
