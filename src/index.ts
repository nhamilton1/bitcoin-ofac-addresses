const SDN_URL =
  "https://sanctionslistservice.ofac.treas.gov/api/publicationpreview/exports/sdn_advanced.xml";

export function parseBitcoinAddresses(xml: string): string[] {
  const featureTypeMatch = xml.match(
    /<FeatureType ID="(\d+)"[^>]*>Digital Currency Address - XBT<\/FeatureType>/,
  );
  if (!featureTypeMatch) {
    throw new Error("Could not find Bitcoin feature type");
  }
  const featureTypeId = featureTypeMatch[1];

  const addresses = new Set<string>();
  const parts = xml.split(`FeatureTypeID="${featureTypeId}"`);

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;

    const nextFeatureEnd = part.indexOf("</Feature>");
    if (nextFeatureEnd === -1) continue;

    const featureSection = part.slice(0, nextFeatureEnd);
    // [^<] so a self-closing <VersionDetail/> can't make the capture swallow markup
    const versionMatches = featureSection.matchAll(
      /<VersionDetail[^>]*>([^<]*)<\/VersionDetail>/g,
    );
    for (const versionMatch of versionMatches) {
      const address = versionMatch[1]?.trim();
      if (address) {
        addresses.add(address);
        break;
      }
    }
  }

  return Array.from(addresses).sort();
}

export async function getBitcoinAddresses(): Promise<string[]> {
  const response = await fetch(SDN_URL, {
    headers: {
      "User-Agent":
        "bitcoin-ofac-addresses (+https://github.com/nhamilton1/bitcoin-ofac-addresses)",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch OFAC SDN list: ${response.status} ${response.statusText}`,
    );
  }
  return parseBitcoinAddresses(await response.text());
}
