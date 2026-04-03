import { zonesRepository } from "../repository/zones.repository.js";
import { capacityService } from "../../distributor/services/capacity.service.js";
import { createLogger } from "../../../infra/logger";

const log = createLogger("zones");

export const zonesService = {
  async list() {
    return zonesRepository.findAllActive();
  },

  async create(data: Record<string, unknown>) {
    const zone = await zonesRepository.create(data);
    log.info({ zoneId: zone.id }, "Zone created");
    return zone;
  },

  async update(id: string, data: Record<string, unknown>) {
    const zone = await zonesRepository.update(id, data);
    log.info({ zoneId: id }, "Zone updated");
    return zone;
  },

  async remove(id: string) {
    await zonesRepository.softDelete(id);
    log.info({ zoneId: id }, "Zone removed");
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
