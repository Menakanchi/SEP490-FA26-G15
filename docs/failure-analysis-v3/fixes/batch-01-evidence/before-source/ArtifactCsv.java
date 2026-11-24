package com.vsos.core.failureanalysis;

import java.util.*;

/** RFC4180 fields, including quoted newlines; accepts recorder CRCRLF and UTF-8 BOM. */
final class ArtifactCsv {
    private ArtifactCsv() {}
    static List<Map<String, Object>> read(String text) {
        text = text.replaceFirst("^\uFEFF", "");
        List<List<String>> records = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder cell = new StringBuilder();
        boolean quoted = false, closed = false;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (quoted) {
                if (c == '"') {
                    if (i + 1 < text.length() && text.charAt(i + 1) == '"') { cell.append('"'); i++; }
                    else { quoted = false; closed = true; }
                } else cell.append(c);
            } else if (c == '"' && cell.isEmpty() && !closed) quoted = true;
            else if (c == ',' || c == '\r' || c == '\n') {
                if (c != ',' && row.isEmpty() && cell.isEmpty() && !closed) continue;
                row.add(cell.toString()); cell.setLength(0); closed = false;
                if (c != ',') { records.add(row); row = new ArrayList<>(); }
            } else {
                if (closed || c == '"') throw new IllegalArgumentException("Invalid CSV quoting");
                cell.append(c);
            }
        }
        if (quoted) throw new IllegalArgumentException("Unclosed CSV quote");
        if (!row.isEmpty() || !cell.isEmpty() || closed) { row.add(cell.toString()); records.add(row); }
        if (records.isEmpty()) throw new IllegalArgumentException("CSV header missing");
        List<String> header = records.removeFirst();
        if (header.stream().anyMatch(String::isEmpty) || new HashSet<>(header).size() != header.size())
            throw new IllegalArgumentException("CSV header empty/duplicated");
        List<Map<String, Object>> out = new ArrayList<>();
        for (List<String> fields : records) {
            if (fields.size() != header.size()) throw new IllegalArgumentException("CSV field count mismatch");
            Map<String, Object> item = new LinkedHashMap<>();
            for (int i = 0; i < header.size(); i++) item.put(header.get(i), fields.get(i).isEmpty() ? null : fields.get(i));
            out.add(item);
        }
        return out;
    }
}
