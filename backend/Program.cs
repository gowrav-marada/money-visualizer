using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using MoneyVisualizer.Api.Data;
using MoneyVisualizer.Api.Infrastructure;
using MoneyVisualizer.Api.Modules.Bills;
using MoneyVisualizer.Api.Modules.Credits;
using MoneyVisualizer.Api.Modules.Dashboard;
using MoneyVisualizer.Api.Modules.Email;
using MoneyVisualizer.Api.Modules.Expenses;
using MoneyVisualizer.Api.Modules.Notifications;
using MoneyVisualizer.Api.Modules.Settings;

var builder = WebApplication.CreateBuilder(args);
var configuration = builder.Configuration;
var environment = builder.Environment;

// Logging: readable console locally, structured JSON everywhere else.
if (!environment.IsDevelopment())
{
	builder.Logging.ClearProviders();
	builder.Logging.AddJsonConsole(options => options.IncludeScopes = true);
}

builder.Services.AddControllers()
	.AddJsonOptions(options => options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddOpenApi();

// Database: SQLite - a single lightweight file, no server to install.
var connectionString = configuration.GetConnectionString("MoneyDatabase")
	?? throw new InvalidOperationException("ConnectionStrings:MoneyDatabase is not configured.");
builder.Services.AddScoped<CurrentUser>();
var sqliteFile = new Microsoft.Data.Sqlite.SqliteConnectionStringBuilder(connectionString).DataSource;
if (!string.IsNullOrWhiteSpace(sqliteFile))
	Directory.CreateDirectory(Path.GetDirectoryName(Path.Combine(environment.ContentRootPath, sqliteFile)) ?? environment.ContentRootPath);
builder.Services.AddDbContext<MoneyDbContext>(options => options.UseSqlite(connectionString));

// Data Protection encrypts mailbox OAuth tokens at rest. Keys live outside the database.
var keysPath = configuration["DataProtection:KeysPath"] ?? Path.Combine(environment.ContentRootPath, "App_Data", "keys");
builder.Services.AddDataProtection()
	.SetApplicationName("MoneyVisualizer")
	.PersistKeysToFileSystem(new DirectoryInfo(keysPath));

ConfigureAuthentication(builder);
builder.Services.AddAuthorization();

builder.Services.AddScoped<UserProvisioner>();
builder.Services.AddSingleton<AttachmentStore>();
builder.Services.AddScoped<SettingsService>();
builder.Services.AddScoped<SettingsAdminService>();
builder.Services.AddScoped<ExpenseService>();
builder.Services.AddScoped<CreditService>();
builder.Services.AddScoped<BillService>();
builder.Services.AddScoped<DashboardService>();
builder.Services.AddScoped<NotificationService>();
builder.Services.AddEmailIntegration(configuration);
if (configuration.GetValue("BackgroundJobs:Enabled", true))
	builder.Services.AddHostedService<RecurringAndReminderWorker>();

var frontendOrigin = configuration["Frontend:Origin"] ?? "http://localhost:3000";
builder.Services.AddCors(options =>
	options.AddPolicy("frontend", policy => policy
		.WithOrigins(frontendOrigin)
		.AllowAnyHeader()
		.AllowAnyMethod()
		.AllowCredentials()));

var app = builder.Build();

if (configuration.GetValue("Database:MigrateOnStartup", true))
{
	using var scope = app.Services.CreateScope();
	var database = scope.ServiceProvider.GetRequiredService<MoneyDbContext>();
	database.Database.Migrate();
}

app.UseExceptionHandler();
app.UseStatusCodePages();
if (!environment.IsDevelopment())
	app.UseHsts();

app.UseCors("frontend");
app.UseMiddleware<CsrfHeaderMiddleware>();
app.UseAuthentication();
app.UseMiddleware<CurrentUserMiddleware>();
app.UseAuthorization();

if (environment.IsDevelopment())
	app.MapOpenApi();
app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "ok" })).AllowAnonymous();

app.Run();

static void ConfigureAuthentication(WebApplicationBuilder builder)
{
	var configuration = builder.Configuration;
	var googleClientId = configuration["Authentication:Google:ClientId"];
	var useGoogle = !string.IsNullOrWhiteSpace(googleClientId);
	var allowDevUser = builder.Environment.IsDevelopment() || builder.Environment.IsEnvironment("Testing");

	if (!useGoogle)
	{
		if (!allowDevUser)
			throw new InvalidOperationException("Authentication:Google:ClientId must be configured outside Development. Sign-in cannot be disabled in production.");

		builder.Services.AddAuthentication(DevelopmentAuthenticationHandler.SchemeName)
			.AddScheme<AuthenticationSchemeOptions, DevelopmentAuthenticationHandler>(DevelopmentAuthenticationHandler.SchemeName, null);
		return;
	}

	builder.Services.AddAuthentication(options =>
		{
			options.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
			options.DefaultChallengeScheme = CookieAuthenticationDefaults.AuthenticationScheme;
		})
		.AddCookie(options =>
		{
			options.Cookie.Name = "mv.auth";
			options.Cookie.HttpOnly = true;
			options.Cookie.SameSite = SameSiteMode.Lax;
			options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
			options.SlidingExpiration = true;
			options.ExpireTimeSpan = TimeSpan.FromHours(8);
			// APIs return 401 instead of redirecting so the SPA can start sign-in itself.
			options.Events.OnRedirectToLogin = context =>
			{
				context.Response.StatusCode = StatusCodes.Status401Unauthorized;
				return Task.CompletedTask;
			};
			options.Events.OnRedirectToAccessDenied = context =>
			{
				context.Response.StatusCode = StatusCodes.Status403Forbidden;
				return Task.CompletedTask;
			};
		})
		.AddOpenIdConnect(options =>
		{
			// Google is a standard OpenID Connect provider.
			options.Authority = "https://accounts.google.com";
			options.ClientId = googleClientId;
			options.ClientSecret = configuration["Authentication:Google:ClientSecret"];
			options.ResponseType = "code";
			options.UsePkce = true;
			options.SaveTokens = false;
			options.CallbackPath = configuration["Authentication:Google:CallbackPath"] ?? "/signin-google";
			options.Scope.Clear();
			options.Scope.Add("openid");
			options.Scope.Add("profile");
			options.Scope.Add("email");
			options.MapInboundClaims = false;
			options.TokenValidationParameters.NameClaimType = "name";
			options.Events.OnRedirectToIdentityProvider = context =>
			{
				context.ProtocolMessage.Prompt = "select_account";
				return Task.CompletedTask;
			};
		});
}

public partial class Program;
