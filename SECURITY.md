# Security Policy

## Scope

Qualia Coding runs **entirely locally** inside your Obsidian vault. There is no telemetry, no cloud sync, no API keys, no runtime server. The plugin's surface is:

- The vault files it reads and writes (markdown, pdf, csv, parquet, images, audio, video, `data.json`)
- The QDPX archives it imports and exports (zipped XML + sources)
- The DOM it renders inside Obsidian

A "security issue" here means anything that could:

- Execute attacker-controlled code through a crafted vault file or imported QDPX
- Exfiltrate vault data to a third party
- Corrupt or destroy user data outside the documented behavior
- Bypass Obsidian's sandbox

Bug reports that are about correctness, UX, or performance — even severe ones — are not security issues. Please open a regular [GitHub issue](https://github.com/mrlnlms/obsidian-qualia-coding/issues) for those.

## Reporting

If you believe you have found a security issue, please **do not open a public issue**. Instead:

1. Use [GitHub's private vulnerability reporting](https://github.com/mrlnlms/obsidian-qualia-coding/security/advisories/new) for this repository, **or**
2. Email the maintainer directly via the address listed on [the author's GitHub profile](https://github.com/mrlnlms)

Include:

- A description of the issue and the impact you observed
- Steps to reproduce, ideally with a minimal vault or QDPX file
- Affected plugin version (`manifest.json` → `version`)
- Affected Obsidian version and OS

Please give us a reasonable window to investigate before disclosing publicly.

## Supported versions

Qualia Coding is pre-alpha. Only the **latest released version** receives security fixes. Older pre-alpha versions are not patched — upgrade and reinstall.

## Scope of MIT license

The plugin is provided as-is under the [MIT License](LICENSE), without warranty. Security reports are appreciated but do not create any obligation beyond what the license states.
