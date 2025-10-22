const SDN_URL =
  "https://sanctionslistservice.ofac.treas.gov/api/publicationpreview/exports/sdn_advanced.xml";

export async function getBitcoinAddresses(): Promise<string[]> {
  const response = await fetch(SDN_URL);
  const xml = await response.text();

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
    const versionMatch = featureSection.match(
      /<VersionDetail[^>]*>(.*?)<\/VersionDetail>/,
    );
    if (versionMatch && versionMatch[1]) {
      addresses.add(versionMatch[1]);
    }
  }

  return Array.from(addresses);
}
