import type { Prisma } from "@prisma/client";
import { getPrisma } from "../../../infra/prisma/client.js";
import { consumerRepository } from "../repository/consumers.repository.js";
import { depositService } from "./deposit.service.js";
import { fetchCep } from "../../../infra/cep/viacep.js";
import { formatZipCode } from "../../../utils/format.js";
import { createLogger } from "../../../infra/logger";

const log = createLogger("consumers");

type TxClient = Prisma.TransactionClient;

export const consumersService = {
  async getProfile(id: string) {
    return consumerRepository.findById(id);
  },

  async updateProfile(
    id: string,
    data: Parameters<typeof consumerRepository.update>[1]
  ) {
    log.info({ consumerId: id }, "Profile updated");
    return consumerRepository.update(id, data);
  },

  async getDepositPreview(consumerId: string) {
    return depositService.getPreview(consumerId);
  },

  async listAddresses(consumerId: string) {
    return consumerRepository.findAddresses(consumerId);
  },

  async createAddress(
    consumerId: string,
    data: {
      zip_code: string;
      street: string;
      number: string;
      complement?: string;
      neighborhood: string;
      city: string;
      state: string;
      is_default: boolean;
    }
  ) {
    const cleanZipCode = data.zip_code.replace(/\D/g, "");
    const formattedZipCode = formatZipCode(cleanZipCode);

    const prisma = getPrisma();
    return prisma.$transaction(async (tx: TxClient) => {
      const coverage = await consumerRepository.findZoneCoverage(
        [cleanZipCode, formattedZipCode],
        tx
      );

      if (!coverage) {
        return { code: "NO_COVERAGE" as const };
      }

      if (data.is_default) {
        await consumerRepository.clearDefaultAddresses(consumerId, tx);
      }

      const address = await consumerRepository.createAddress(
        {
          consumer_id: consumerId,
          zip_code: formattedZipCode,
          street: data.street,
          number: data.number,
          complement: data.complement || null,
          neighborhood: data.neighborhood,
          city: data.city,
          state: data.state,
          zone_id: coverage.zone_id,
          is_default: data.is_default,
        },
        tx
      );

      log.info({ consumerId, addressId: address.id, zipCode: formattedZipCode }, "Address created");
      return { address };
    });
  },

  async lookupCep(cep: string) {
    return fetchCep(cep);
  },
};
