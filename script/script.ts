import { $ } from "bun";

const BUMP_TYPE = process.env["BITCOIN_OFAC_BUMP"]?.toLowerCase() ?? "patch";

const VERSION = await (async () => {
  if (process.env["BITCOIN_OFAC_VERSION"]) {
    return process.env["BITCOIN_OFAC_VERSION"];
  }

  const currentVersion = await fetch(
    "https://registry.npmjs.org/bitcoin-ofac-addresses/latest",
  )
    .then((res) => {
      if (!res.ok) {
        if (res.status === 404) return { version: "0.0.0" };
        throw new Error(res.statusText);
      }
      return res.json();
    })
    .then((data: any) => data.version);

  const [major, minor, patch] = currentVersion
    .split(".")
    .map((x: string) => Number(x) || 0);

  if (BUMP_TYPE === "major") return `${major + 1}.0.0`;
  if (BUMP_TYPE === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
})();

export const Script = {
  get version() {
    return VERSION;
  },
  get bumpType() {
    return BUMP_TYPE;
  },
};

console.log(`Script config:`, JSON.stringify(Script, null, 2));

export async function commitAndTag(version: string) {
  const tagName = `v${version}`;
  const commitMessage = `chore: release v${version}`;
  await $`git config user.name "GitHub Actions"`;
  await $`git config user.email "actions@github.com"`;

  // commit before pull --rebase: git refuses to rebase onto a dirty tree
  const dirty = (await $`git status --porcelain package.json`.text()).trim();
  if (dirty) {
    await $`git add package.json`;
    await $`git commit -m ${commitMessage}`;
  } else {
    console.log("package.json already committed at this version; skipping commit");
  }

  await $`git pull --rebase origin master`;

  const tagExists =
    (await $`git rev-parse -q --verify refs/tags/${tagName}`.nothrow())
      .exitCode === 0;
  if (!tagExists) {
    await $`git tag ${tagName}`;
  } else {
    console.log(`Tag ${tagName} already exists; skipping tag`);
  }

  await $`git push origin HEAD --tags`;
  return tagName;
}

export async function createRelease(version: string, addressCount: number) {
  const tagName = `v${version}`;
  const releaseNotes = `## Release v${version}

### Summary
- Updated OFAC sanctioned Bitcoin addresses
- Total addresses: **${addressCount}**
- Data source: [OFAC SDN List](https://sanctionslist.ofac.treas.gov/Home/SdnList)

### Installation
\`\`\`bash
bun add bitcoin-ofac-addresses@${version}
# or
npm install bitcoin-ofac-addresses@${version}
\`\`\`

### Usage
\`\`\`typescript
import { ofacAddresses } from "bitcoin-ofac-addresses/static";
console.log(\`Loaded \${ofacAddresses.length} addresses\`);
\`\`\`
`;

  await $`gh release create ${tagName} --title "v${version}" --notes ${releaseNotes}`;
  return tagName;
}
