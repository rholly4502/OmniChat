using NetArchTest.Rules;
using Xunit;

namespace OmniChat.ArchitectureTests;

/// <summary>
/// Pagar deterministik arsitektur Clean Architecture. Menegakkan aturan dependensi
/// berbasis namespace sehingga AI agent (atau manusia) tidak bisa mengambil jalan pintas
/// seperti inject DbContext di Controller atau meletakkan logic database di Domain.
/// </summary>
public class ArchitectureTests
{
    private const string DomainNamespace = "OmniChat.Domain";
    private const string ApplicationNamespace = "OmniChat.Application";
    private const string ControllersNamespace = "OmniChat.Api.Controllers";
    private const string InfrastructureApiNamespace = "OmniChat.Api.Infrastructure";
    private const string InfrastructureNamespace = "OmniChat.Infrastructure";
    private const string EfNamespace = "Microsoft.EntityFrameworkCore";

    private static System.Reflection.Assembly ServiceAssembly
        => typeof(OmniChat.Api.Controllers.ChatController).Assembly;

    // 1. Domain tidak boleh bergantung pada Application/Infrastructure/Controllers.
    [Fact]
    public void Domain_ShouldNotDependOn_Application_Or_Infrastructure_Or_Controllers()
    {
        var result = Types
            .InAssembly(ServiceAssembly)
            .That()
            .ResideInNamespace(DomainNamespace)
            .ShouldNot()
            .HaveDependencyOnAny(ApplicationNamespace, InfrastructureApiNamespace, InfrastructureNamespace, ControllersNamespace)
            .GetResult();

        Assert.True(result.IsSuccessful, DescribeFailures(result, "Domain"));
    }

    // 2. Application tidak boleh bergantung pada Infrastructure (hanya interface/abstraksi).
    [Fact]
    public void Application_ShouldNotDependOn_Infrastructure()
    {
        var result = Types
            .InAssembly(ServiceAssembly)
            .That()
            .ResideInNamespace(ApplicationNamespace)
            .ShouldNot()
            .HaveDependencyOnAny(InfrastructureApiNamespace, InfrastructureNamespace)
            .GetResult();

        Assert.True(result.IsSuccessful, DescribeFailures(result, "Application"));
    }

    // 3. Controllers tidak boleh bergantung pada Infrastructure.
    [Fact]
    public void Controllers_ShouldNotDependOn_Infrastructure()
    {
        var result = Types
            .InAssembly(ServiceAssembly)
            .That()
            .ResideInNamespace(ControllersNamespace)
            .ShouldNot()
            .HaveDependencyOnAny(InfrastructureApiNamespace, InfrastructureNamespace)
            .GetResult();

        Assert.True(result.IsSuccessful, DescribeFailures(result, "Controllers"));
    }

    // 4. Microsoft.EntityFrameworkCore tidak boleh muncul di Domain/Application/Controllers.
    [Fact]
    public void EntityFramework_ShouldOnlyBeUsed_InInfrastructure()
    {
        var domain = Types.InAssembly(ServiceAssembly)
            .That().ResideInNamespace(DomainNamespace)
            .ShouldNot().HaveDependencyOnAny(EfNamespace)
            .GetResult();

        var application = Types.InAssembly(ServiceAssembly)
            .That().ResideInNamespace(ApplicationNamespace)
            .ShouldNot().HaveDependencyOnAny(EfNamespace)
            .GetResult();

        var controllers = Types.InAssembly(ServiceAssembly)
            .That().ResideInNamespace(ControllersNamespace)
            .ShouldNot().HaveDependencyOnAny(EfNamespace)
            .GetResult();

        var messages = new List<string>();
        if (!domain.IsSuccessful) messages.Add(DescribeFailures(domain, "Domain"));
        if (!application.IsSuccessful) messages.Add(DescribeFailures(application, "Application"));
        if (!controllers.IsSuccessful) messages.Add(DescribeFailures(controllers, "Controllers"));

        Assert.True(messages.Count == 0, string.Join("\n", messages));
    }

    private static string DescribeFailures(TestResult result, string layer)
    {
        var failures = result.FailingTypes;
        var detail = failures is null || failures.Count == 0
            ? "(tanpa detail tipe)"
            : string.Join("\n", failures.Select(t => $"  - {t.FullName}"));
        return $"Pelanggaran layer {layer}:\n{detail}";
    }
}
