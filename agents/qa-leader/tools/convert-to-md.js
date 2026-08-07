import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import mammoth from "mammoth";
import XLSX from "xlsx";
import officeParser from "officeparser";

/**
 * Convert DOCX file to Markdown (.md)
 */
export async function convertDocxToMd(filePath, outputDir) {
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);
  const outPath = path.join(outputDir, `${baseName}.md`);

  try {
    const result = await mammoth.extractRawText({ path: filePath });
    const text = result.value || "";
    const markdownContent = `# ${baseName}\n\n` + text.replace(/\r\n/g, "\n").replace(/\n\n+/g, "\n\n");
    fs.writeFileSync(outPath, markdownContent, "utf-8");
    console.log(`[OK] Converted DOCX -> MD: ${outPath}`);
    return outPath;
  } catch (err) {
    console.error(`[ERROR] Failed to convert DOCX ${filePath}:`, err.message);
    throw err;
  }
}

/**
 * Convert XLSX file to CSV (.csv)
 */
export async function convertXlsxToCsv(filePath, outputDir) {
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);

  try {
    const workbook = XLSX.readFile(filePath);
    const convertedFiles = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csvContent = XLSX.utils.sheet_to_csv(sheet);

      const fileName = workbook.SheetNames.length === 1
        ? `${baseName}.csv`
        : `${baseName}_${sheetName.replace(/[^a-zA-Z0-9_-]/g, "_")}.csv`;

      const outPath = path.join(outputDir, fileName);
      fs.writeFileSync(outPath, csvContent, "utf-8");
      console.log(`[OK] Converted XLSX Sheet [${sheetName}] -> CSV: ${outPath}`);
      convertedFiles.push(outPath);
    }
    return convertedFiles;
  } catch (err) {
    console.error(`[ERROR] Failed to convert XLSX ${filePath}:`, err.message);
    throw err;
  }
}

/**
 * Convert PPTX file to Markdown (.md)
 */
export async function convertPptxToMd(filePath, outputDir) {
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);
  const outPath = path.join(outputDir, `${baseName}.md`);

  try {
    const rawText = await officeParser.parseOfficeAsync(filePath);
    const markdownContent = `# ${baseName}\n\n${rawText}`;
    fs.writeFileSync(outPath, markdownContent, "utf-8");
    console.log(`[OK] Converted PPTX -> MD: ${outPath}`);
    return outPath;
  } catch (err) {
    console.error(`[ERROR] Failed to convert PPTX ${filePath}:`, err.message);
    throw err;
  }
}

/**
 * Check type of document and automatically convert it based on the format
 */
export async function convertFile(inputPath, outputDir = path.dirname(inputPath)) {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`File or directory does not exist: ${inputPath}`);
  }

  const stat = fs.statSync(inputPath);

  if (stat.isDirectory()) {
    return await convertDirectory(inputPath, outputDir);
  }

  const ext = path.extname(inputPath).toLowerCase();
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  switch (ext) {
    case ".docx":
    case ".doc":
      return await convertDocxToMd(inputPath, outputDir);
    case ".xlsx":
    case ".xls":
      return await convertXlsxToCsv(inputPath, outputDir);
    case ".pptx":
    case ".ppt":
      return await convertPptxToMd(inputPath, outputDir);
    case ".md":
    case ".csv":
    case ".txt":
      console.log(`[INFO] File is already in the target format (${ext}): ${inputPath}`);
      return [inputPath];
    default:
      console.warn(`[WARN] Unsupported file format (${ext}): ${inputPath}`);
      return [];
  }
}

/**
 * Traverse and convert all documents in the directory
 */
export async function convertDirectory(dirPath, outputDir = dirPath) {
  const files = fs.readdirSync(dirPath);
  const results = [];

  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const stat = fs.statSync(fullPath);

    if (stat.isFile()) {
      const res = await convertFile(fullPath, outputDir);
      if (Array.isArray(res)) {
        results.push(...res);
      } else if (res) {
        results.push(res);
      }
    }
  }

  return results;
}

// Run directly from CLI if the file is called as the main module
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  const target = args[0] || "./project-docs";
  const outDir = args[1] || target;

  console.log(`Checking and normalizing documents at: ${target}`);
  convertFile(target, outDir)
    .then((converted) => {
      console.log("\nDocument conversion completed:", converted);
    })
    .catch((err) => {
      console.error("Error converting document:", err);
      process.exit(1);
    });
}
