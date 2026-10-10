using OmniChat.Domain.Models;

namespace OmniChat.Application.Interfaces;

/// <summary>Supplies the model catalog advertised to clients.</summary>
public interface IModelCatalogService
{
    ModelCatalog GetCatalog();
}
