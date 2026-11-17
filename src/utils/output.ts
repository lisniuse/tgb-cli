import pc from "picocolors";

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function visualWidth(value: string): number {
  let width = 0;
  for (const char of value) {
    const code = char.codePointAt(0) || 0;
    if (
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe4f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6)
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

function pad(value: string, width: number, align: "left" | "right" = "left"): string {
  const gap = Math.max(0, width - visualWidth(value));
  return align === "left" ? value + " ".repeat(gap) : " ".repeat(gap) + value;
}

export interface TableColumn {
  header: string;
  align?: "left" | "right";
  maxWidth?: number;
}

export function printTable(columns: TableColumn[], rows: string[][]): void {
  const widths = columns.map((col, index) => {
    const contentWidth = Math.max(visualWidth(col.header), ...rows.map((row) => visualWidth(row[index] || "")));
    return col.maxWidth ? Math.min(contentWidth, col.maxWidth) : contentWidth;
  });

  const renderRow = (row: string[], bold = false): string =>
    row
      .map((cell, index) => {
        let value = cell || "";
        if (columns[index]?.maxWidth && visualWidth(value) > columns[index].maxWidth!) {
          let result = "";
          for (const char of value) {
            if (visualWidth(result + char + "…") > columns[index].maxWidth!) break;
            result += char;
          }
          value = `${result}…`;
        }
        const padded = pad(value, widths[index], columns[index]?.align || "left");
        return bold ? pc.bold(padded) : padded;
      })
      .join("  ");

  console.log(renderRow(columns.map((c) => c.header), true));
  console.log(pc.dim(widths.map((w) => "─".repeat(w)).join("  ")));
  for (const row of rows) console.log(renderRow(row));
}

export function heading(text: string): void {
  console.log(pc.bold(pc.cyan(text)));
}

export function dim(text: string): string {
  return pc.dim(text);
}

export function ok(text: string): void {
  console.log(`${pc.green("✓")} ${text}`);
}

export function warn(text: string): void {
  console.warn(`${pc.yellow("!")} ${text}`);
}

export function fail(text: string): void {
  console.error(`${pc.red("✗")} ${text}`);
}

export function info(text: string): void {
  console.log(text);
}

export function kvBlock(entries: Array<[string, string | number | undefined]>): void {
  const width = Math.max(...entries.map(([key]) => visualWidth(key)));
  for (const [key, value] of entries) {
    if (value === undefined || value === null || value === "") continue;
    console.log(`${pc.dim(pad(key, width))}  ${value}`);
  }
}
