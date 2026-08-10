import { describe, expect, it } from "vitest";
import {
  coverageSchema,
  coverageBulkSchema,
  zoneUpdateSchema,
  zoneOpsQuerySchema,
} from "./zone";
import { normalizeZipCode, normalizeNeighborhood } from "../utils/zip";

describe("normalizeZipCode", () => {
  it("normalizes 8 digits with and without separator to the stored format", () => {
    expect(normalizeZipCode("36010000")).toBe("36010-000");
    expect(normalizeZipCode("36010-000")).toBe("36010-000");
    expect(normalizeZipCode(" 36010 000 ")).toBe("36010-000");
  });

  it("rejects anything that is not 8 digits", () => {
    expect(normalizeZipCode("36010")).toBeNull();
    expect(normalizeZipCode("360100000")).toBeNull();
    expect(normalizeZipCode("")).toBeNull();
  });
});

describe("normalizeNeighborhood", () => {
  it("strips accents, case and extra spaces for comparison", () => {
    expect(normalizeNeighborhood("São  Pedro")).toBe("sao pedro");
    expect(normalizeNeighborhood("SAO PEDRO")).toBe("sao pedro");
  });
});

describe("coverageSchema", () => {
  it("normalizes the zip code to the format the address lookup uses", () => {
    const parsed = coverageSchema.parse({ neighborhood: "Centro", zip_code: "36010000" });
    expect(parsed.zip_code).toBe("36010-000");
  });

  it("rejects the legacy 5-digit zip that never matched a real address", () => {
    const result = coverageSchema.safeParse({ neighborhood: "Centro", zip_code: "36010" });
    expect(result.success).toBe(false);
  });

  it("accepts neighborhood only", () => {
    const parsed = coverageSchema.parse({ neighborhood: "Granbery" });
    expect(parsed.neighborhood).toBe("Granbery");
    expect(parsed.zip_code).toBeUndefined();
  });

  it("accepts zip code only", () => {
    const parsed = coverageSchema.parse({ zip_code: "36035-000" });
    expect(parsed.zip_code).toBe("36035-000");
    expect(parsed.neighborhood).toBeUndefined();
  });

  it("rejects a row with neither neighborhood nor zip", () => {
    expect(coverageSchema.safeParse({}).success).toBe(false);
    expect(coverageSchema.safeParse({ neighborhood: "", zip_code: "" }).success).toBe(false);
  });
});

describe("coverageBulkSchema", () => {
  it("accepts a list and normalizes every row", () => {
    const parsed = coverageBulkSchema.parse({
      items: [{ zip_code: "36010000" }, { neighborhood: "Centro" }],
    });
    expect(parsed.items[0]?.zip_code).toBe("36010-000");
    expect(parsed.items).toHaveLength(2);
  });

  it("rejects an empty list", () => {
    expect(coverageBulkSchema.safeParse({ items: [] }).success).toBe(false);
  });
});

describe("zoneOpsQuerySchema", () => {
  it("defaults to the first page of active zones", () => {
    const parsed = zoneOpsQuerySchema.parse({});
    expect(parsed).toMatchObject({ status: "active", limit: 20, offset: 0 });
  });

  it("coerces limit and offset coming from the query string", () => {
    const parsed = zoneOpsQuerySchema.parse({ limit: "50", offset: "100" });
    expect(parsed.limit).toBe(50);
    expect(parsed.offset).toBe(100);
  });

  it("caps limit at 100 so a client cannot ask for the whole table", () => {
    expect(zoneOpsQuerySchema.safeParse({ limit: "500" }).success).toBe(false);
  });

  it("rejects a negative offset", () => {
    expect(zoneOpsQuerySchema.safeParse({ offset: "-1" }).success).toBe(false);
  });

  it("treats empty filter strings as absent", () => {
    const parsed = zoneOpsQuerySchema.parse({ q: "", coverage: "", distributor_id: "" });
    expect(parsed.q).toBeUndefined();
    expect(parsed.coverage).toBeUndefined();
    expect(parsed.distributor_id).toBeUndefined();
  });

  it("rejects an unknown status", () => {
    expect(zoneOpsQuerySchema.safeParse({ status: "deleted" }).success).toBe(false);
  });
});

describe("zoneUpdateSchema", () => {
  it("does not accept distributor_id — transfer has its own route", () => {
    const parsed = zoneUpdateSchema.parse({
      name: "Zona Sul",
      distributor_id: "7e1d7b55-3f52-4d10-aac3-74387c236901",
    });
    expect(parsed).not.toHaveProperty("distributor_id");
  });

  it("rejects an empty patch", () => {
    expect(zoneUpdateSchema.safeParse({}).success).toBe(false);
  });
});
