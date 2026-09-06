export class CatalogRepository {
  async list(_type, _options = {}) {
    throw new Error('CatalogRepository.list is not implemented');
  }

  async getById(_type, _id) {
    throw new Error('CatalogRepository.getById is not implemented');
  }

  async create(_type, _input) {
    throw new Error('CatalogRepository.create is not implemented');
  }

  async update(_type, _id, _input, _expectedVersion) {
    throw new Error('CatalogRepository.update is not implemented');
  }
}
