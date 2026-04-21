// tests/e2e/helpers/generate-qdpx.ts
import { zipSync, strToU8 } from 'fflate';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const PROJECT_XML = `<?xml version="1.0" encoding="utf-8"?>
<Project name="Sample QDA Project" origin="Qualia Test Suite" creationDateTime="2026-01-01T00:00:00Z" xmlns="urn:QDA-XML:project:1.0">
<CodeBook>
<Codes>
  <Code guid="c-emotions" name="Emotions" color="#FF0000" isCodable="true">
    <Description>Parent code for emotions</Description>
    <Code guid="c-joy" name="Joy" color="#00FF00" isCodable="true"/>
    <Code guid="c-frustration" name="Frustration" color="#0000FF" isCodable="true"/>
  </Code>
  <Code guid="c-cost" name="Cost" color="#FF9800" isCodable="true"/>
</Codes>
</CodeBook>
<Sources>
  <TextSource guid="src-1" name="interview.txt" plainTextPath="internal://src-1.txt">
    <PlainTextSelection guid="sel-1" startPosition="0" endPosition="24" creationDateTime="2026-01-01T00:00:00Z">
      <Coding guid="cod-1" creationDateTime="2026-01-01T00:00:00Z">
        <CodeRef targetGUID="c-joy"/>
        <NoteRef targetGUID="note-mag"/>
      </Coding>
      <NoteRef targetGUID="note-memo"/>
    </PlainTextSelection>
    <PlainTextSelection guid="sel-2" startPosition="25" endPosition="60" creationDateTime="2026-01-02T00:00:00Z">
      <Coding guid="cod-2" creationDateTime="2026-01-02T00:00:00Z">
        <CodeRef targetGUID="c-frustration"/>
      </Coding>
      <Coding guid="cod-3" creationDateTime="2026-01-02T00:00:00Z">
        <CodeRef targetGUID="c-cost"/>
      </Coding>
    </PlainTextSelection>
  </TextSource>
</Sources>
<Notes>
  <Note guid="note-memo" name="Memo: Interview" creationDateTime="2026-01-01T00:00:00Z">
    <PlainTextContent>Strong positive affect expressed by participant</PlainTextContent>
  </Note>
  <Note guid="note-mag" name="Magnitude" creationDateTime="2026-01-01T00:00:00Z">
    <PlainTextContent>[Magnitude: High]</PlainTextContent>
  </Note>
</Notes>
<Links>
  <Link guid="link-1" name="causes" direction="OneWay" originGUID="c-joy" targetGUID="c-frustration"/>
  <Link guid="link-2" name="relates_to" direction="Associative" originGUID="c-cost" targetGUID="c-emotions"/>
</Links>
</Project>`;

const sourceText = 'I felt really happy today but then I started feeling frustrated about the costs involved in everything';

const dest = 'tests/e2e/vaults/visual/sample-import.qdpx';
mkdirSync(dirname(dest), { recursive: true });

const files: Record<string, Uint8Array> = {
  'project.qde': strToU8(PROJECT_XML),
  'sources/src-1.txt': strToU8(sourceText),
};

const zip = zipSync(files);
writeFileSync(dest, zip);
console.log(`Generated ${dest} (${zip.length} bytes)`);
