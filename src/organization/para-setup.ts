/**
 * PARA Method Implementation for Jira Ticket Organization
 * 
 * Implements the PARA method (Projects, Areas, Resources, Archives) 
 * with numbered folders for consistent ordering and project-specific organization.
 */

import { Vault, TFolder } from 'obsidian';

/**
 * Configuration for PARA structure creation
 */
interface PARAConfig {
  projectsFolder: string;
  areasFolder: string;
  resourcesFolder: string;
  archivesFolder: string;
  projectCodes: string[];
}

/**
 * Default PARA configuration with work-focused organization
 */
const DEFAULT_PARA_CONFIG: PARAConfig = {
  projectsFolder: '01_Projects',
  areasFolder: '02_Areas',
  resourcesFolder: '03_Resources', 
  archivesFolder: '04_Archives',
  projectCodes: ['RICCE', 'SWSE', 'ECOMCP'] // Common project codes from user's vault
};

/**
 * Initialize complete PARA folder structure
 */
export async function initializePARAStructure(vault: Vault, config?: Partial<PARAConfig>): Promise<void> {
  const finalConfig = { ...DEFAULT_PARA_CONFIG, ...config };
  
  console.log('Jira Sync Pro: Initializing PARA structure...');
  
  // Define complete folder structure
  const folders = buildPARAFolderList(finalConfig);
  
  // Create folders in order
  for (const folder of folders) {
    await createFolderIfNotExists(vault, folder);
  }
  
  console.log(`Jira Sync Pro: PARA structure initialized with ${folders.length} folders`);
}

/**
 * Build complete list of PARA folders to create
 */
function buildPARAFolderList(config: PARAConfig): string[] {
  const currentYear = new Date().getFullYear();
  
  const folders: string[] = [
    // 01_Projects - Active project work
    config.projectsFolder,
    ...config.projectCodes.map(code => `${config.projectsFolder}/${code}`),
    
    // 02_Areas - Ongoing areas of responsibility  
    config.areasFolder,
    `${config.areasFolder}/Work`,
    `${config.areasFolder}/Work/Documentation`,
    `${config.areasFolder}/Work/Standards`,
    `${config.areasFolder}/Work/Processes`,
    `${config.areasFolder}/Development`,
    `${config.areasFolder}/Development/Scripts`,
    `${config.areasFolder}/Development/Tools`,
    
    // 03_Resources - Reference materials
    config.resourcesFolder,
    `${config.resourcesFolder}/Templates`,
    `${config.resourcesFolder}/Templates/Ticket`,
    `${config.resourcesFolder}/References`,
    `${config.resourcesFolder}/References/Jira`,
    `${config.resourcesFolder}/References/Documentation`,
    
    // 04_Archives - Completed items
    config.archivesFolder,
    `${config.archivesFolder}/${currentYear}`,
    ...config.projectCodes.map(code => `${config.archivesFolder}/${currentYear}/${code}`)
  ];
  
  return folders;
}

/**
 * Create folder if it doesn't exist
 */
async function createFolderIfNotExists(vault: Vault, folderPath: string): Promise<void> {
  const existingFolder = vault.getAbstractFileByPath(folderPath);
  
  if (!existingFolder) {
    try {
      await vault.createFolder(folderPath);
      console.log(`Created folder: ${folderPath}`);
    } catch (error) {
      console.error(`Failed to create folder ${folderPath}:`, error);
      throw error;
    }
  } else {
    console.log(`Folder already exists: ${folderPath}`);
  }
}

/**
 * Check if PARA structure exists
 */
export function checkPARAStructure(vault: Vault, config?: Partial<PARAConfig>): boolean {
  const finalConfig = { ...DEFAULT_PARA_CONFIG, ...config };
  
  // Check if main PARA folders exist
  const mainFolders = [
    finalConfig.projectsFolder,
    finalConfig.areasFolder,
    finalConfig.resourcesFolder,
    finalConfig.archivesFolder
  ];
  
  return mainFolders.every(folder => {
    const folderObj = vault.getAbstractFileByPath(folder);
    return folderObj instanceof TFolder;
  });
}

/**
 * Get project folder path for a given project code
 */
export function getProjectFolderPath(projectCode: string, config?: Partial<PARAConfig>): string {
  const finalConfig = { ...DEFAULT_PARA_CONFIG, ...config };
  return `${finalConfig.projectsFolder}/${projectCode}`;
}

/**
 * Get archive folder path for a given project code and year
 */
export function getArchiveFolderPath(projectCode: string, year?: number, config?: Partial<PARAConfig>): string {
  const finalConfig = { ...DEFAULT_PARA_CONFIG, ...config };
  const archiveYear = year || new Date().getFullYear();
  return `${finalConfig.archivesFolder}/${archiveYear}/${projectCode}`;
}

/**
 * Validate PARA configuration
 */
export function validatePARAConfig(config: Partial<PARAConfig>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check folder names
  const folderFields = ['projectsFolder', 'areasFolder', 'resourcesFolder', 'archivesFolder'];
  folderFields.forEach(field => {
    const value = config[field as keyof PARAConfig];
    if (value && typeof value === 'string') {
      if (value.includes('..') || value.startsWith('/') || value.includes('\\')) {
        errors.push(`Invalid ${field}: contains invalid characters`);
      }
    }
  });
  
  // Check project codes
  if (config.projectCodes) {
    config.projectCodes.forEach(code => {
      if (!/^[A-Z]{2,10}$/.test(code)) {
        errors.push(`Invalid project code '${code}': must be 2-10 uppercase letters`);
      }
    });
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Generate PARA folder structure report
 */
export function generatePARAReport(vault: Vault, config?: Partial<PARAConfig>): string {
  const finalConfig = { ...DEFAULT_PARA_CONFIG, ...config };
  const folders = buildPARAFolderList(finalConfig);
  
  let report = `# PARA Structure Status Report\n\n`;
  report += `Generated: ${new Date().toISOString()}\n\n`;
  report += `## Configuration\n`;
  report += `- Projects: ${finalConfig.projectsFolder}\n`;
  report += `- Areas: ${finalConfig.areasFolder}\n`;
  report += `- Resources: ${finalConfig.resourcesFolder}\n`;
  report += `- Archives: ${finalConfig.archivesFolder}\n`;
  report += `- Project Codes: ${finalConfig.projectCodes.join(', ')}\n\n`;
  
  report += `## Folder Status\n\n`;
  
  folders.forEach(folder => {
    const exists = vault.getAbstractFileByPath(folder) instanceof TFolder;
    const status = exists ? '✅' : '❌';
    report += `${status} ${folder}\n`;
  });
  
  const existingCount = folders.filter(folder => 
    vault.getAbstractFileByPath(folder) instanceof TFolder
  ).length;
  
  report += `\n**Summary**: ${existingCount}/${folders.length} folders exist\n`;
  
  return report;
}