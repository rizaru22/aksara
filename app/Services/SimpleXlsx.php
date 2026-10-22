<?php

namespace App\Services;

use RuntimeException;
use SimpleXMLElement;
use ZipArchive;

/** Small, dependency-free XLSX reader/writer for the import templates. */
class SimpleXlsx
{
    public function write(array $headers, string $sheetName): string
    {
        $path = tempnam(sys_get_temp_dir(), 'aksara-xlsx-');
        if ($path === false) throw new RuntimeException('Tidak dapat membuat berkas template sementara.');

        $zip = new ZipArchive();
        if ($zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            @unlink($path);
            throw new RuntimeException('Ekstensi ZIP PHP diperlukan untuk membuat template Excel.');
        }
        $zip->addFromString('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
        $zip->addFromString('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
        $zip->addFromString('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="'.htmlspecialchars($sheetName, ENT_XML1 | ENT_QUOTES, 'UTF-8').'" sheetId="1" r:id="rId1"/></sheets></workbook>');
        $zip->addFromString('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
        $zip->addFromString('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="@"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
        $cells = '';
        foreach (array_values($headers) as $index => $header) {
            $column = $this->columnName($index + 1);
            $value = htmlspecialchars((string) $header, ENT_XML1 | ENT_QUOTES, 'UTF-8');
            $cells .= '<c r="'.$column.'1" t="inlineStr"><is><t>'.$value.'</t></is></c>';
        }
        $textColumns = '';
        foreach (array_values($headers) as $index => $header) {
            if (str_contains(strtolower((string) $header), 'nip') || str_contains(strtolower((string) $header), 'nisn') || str_contains(strtolower((string) $header), 'kode')) {
                $textColumns .= '<col min="'.($index + 1).'" max="'.($index + 1).'" width="18" customWidth="1" style="1"/>';
            }
        }
        $zip->addFromString('xl/worksheets/sheet1.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>'.$textColumns.'</cols><sheetData><row r="1">'.$cells.'</row></sheetData></worksheet>');
        $zip->close();

        $content = file_get_contents($path);
        @unlink($path);
        if ($content === false) throw new RuntimeException('Template Excel gagal dibaca.');

        return $content;
    }

    /** @return list<array<string, string>> */
    public function read(string $path): array
    {
        $zip = new ZipArchive();
        if ($zip->open($path) !== true) throw new RuntimeException('Berkas tidak terbaca sebagai Excel .xlsx yang valid.');
        $expandedBytes = 0;
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $stat = $zip->statIndex($i);
            $expandedBytes += (int) ($stat['size'] ?? 0);
            if ($expandedBytes > 20 * 1024 * 1024) {
                $zip->close();
                throw new RuntimeException('Ukuran isi Excel terlalu besar. Maksimum 20 MB setelah diekstrak.');
            }
        }

        $workbook = $this->xml($zip->getFromName('xl/workbook.xml'));
        $relations = $this->xml($zip->getFromName('xl/_rels/workbook.xml.rels'));
        $sheetNode = $workbook->sheets->sheet[0] ?? null;
        if (! $sheetNode) { $zip->close(); throw new RuntimeException('Workbook tidak memiliki sheet.'); }
        $relationId = (string) $sheetNode->attributes('http://schemas.openxmlformats.org/officeDocument/2006/relationships')->id;
        $target = null;
        foreach ($relations->Relationship as $relationship) {
            if ((string) $relationship['Id'] === $relationId) $target = (string) $relationship['Target'];
        }
        if (! $target || str_contains($target, '..')) { $zip->close(); throw new RuntimeException('Sheet pertama tidak dapat ditemukan.'); }
        $sheetPath = str_starts_with($target, '/') ? ltrim($target, '/') : 'xl/'.ltrim($target, '/');

        $strings = [];
        $sharedXml = $zip->getFromName('xl/sharedStrings.xml');
        if ($sharedXml !== false) {
            $shared = $this->xml($sharedXml);
            foreach ($shared->si as $item) $strings[] = $this->textContent($item);
        }

        $sheet = $this->xml($zip->getFromName($sheetPath));
        $rows = [];
        foreach ($sheet->sheetData->row ?? [] as $row) {
            $values = [];
            foreach ($row->c ?? [] as $cell) {
                $index = $this->columnIndex((string) $cell['r']);
                $type = (string) $cell['t'];
                $value = match ($type) {
                    'inlineStr' => $this->textContent($cell->is),
                    's' => $strings[(int) ($cell->v ?? -1)] ?? '',
                    'b' => (string) $cell->v === '1' ? '1' : '0',
                    default => (string) ($cell->v ?? ''),
                };
                $values[$index] = trim($value);
            }
            if ($values) $rows[] = $values;
            if (count($rows) > 2001) { $zip->close(); throw new RuntimeException('Maksimum 2.000 baris data per impor.'); }
        }
        $zip->close();

        if (count($rows) < 2) throw new RuntimeException('Sheet harus berisi baris judul dan minimal satu baris data.');
        $headers = array_map(fn ($header) => strtolower(trim((string) $header)), $rows[0]);
        if (count(array_filter($headers)) !== count(array_unique(array_filter($headers)))) throw new RuntimeException('Nama kolom pada baris pertama tidak boleh kosong atau duplikat.');
        $result = [];
        foreach (array_slice($rows, 1) as $values) {
            $item = [];
            foreach ($headers as $index => $header) if ($header !== '') $item[$header] = $values[$index] ?? '';
            if (count(array_filter($item, fn ($value) => $value !== '')) > 0) $result[] = $item;
        }
        return $result;
    }

    private function xml(string|false $value): SimpleXMLElement
    {
        if ($value === false) throw new RuntimeException('Struktur berkas Excel tidak lengkap. Gunakan file .xlsx.');
        $xml = simplexml_load_string($value, SimpleXMLElement::class, LIBXML_NONET | LIBXML_NOBLANKS);
        if (! $xml) throw new RuntimeException('Format XML di dalam Excel tidak valid.');
        return $xml;
    }

    private function textContent(SimpleXMLElement $element): string
    {
        $nodes = $element->xpath('.//*[local-name()="t"]') ?: [];
        return implode('', array_map('strval', $nodes));
    }

    private function columnName(int $number): string
    {
        $name = '';
        while ($number > 0) { $number--; $name = chr(65 + ($number % 26)).$name; $number = intdiv($number, 26); }
        return $name;
    }

    private function columnIndex(string $cell): int
    {
        preg_match('/^[A-Z]+/', strtoupper($cell), $match);
        $number = 0;
        foreach (str_split($match[0] ?? '') as $character) $number = ($number * 26) + ord($character) - 64;
        return max(0, $number - 1);
    }
}
