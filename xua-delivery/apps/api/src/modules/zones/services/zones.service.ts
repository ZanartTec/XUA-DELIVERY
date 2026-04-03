import { zonesRepository } from "../repository/zones.repository.js";
import { capacityService } from "../../distributor/capacity.service.js";

export const zonesService = {
  async list() {
    return zonesRepository.findAllActive();
  },

  async create(data: Record<string, unknown>) {
    return zonesRepository.create(data);
  },

  async update(id: string, data: Record<string, unknown>) {
    return zonesRepository.update(id, data);
  },

  async remove(id: string) {
    return zonesRepository.softDelete(id);
  },

  async getCapacity(zoneId: string, startDate: string, endDate: string) {
    return capacityService.checkAvailability(zoneId, startDate, endDate);
  },

  async addCoverage(
    zoneId: string,
    data: { neighborhood: string; zip_code: string }
  ) {
    return zonesRepository.createCoverage({ zone_id: zoneId, ...data });
  },

  async removeCoverage(coverageId: string, zoneId: string) {
    return zonesRepository.deleteCoverage(coverageId, zoneId);
  },
};
