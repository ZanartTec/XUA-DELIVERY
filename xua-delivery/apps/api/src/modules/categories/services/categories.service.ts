import { categoriesRepository } from "../repository/categories.repository.js";

export const categoriesService = {
  async listAll() {
    return categoriesRepository.findAll();
  },
};
