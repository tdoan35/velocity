import type { ProjectFile } from '../types';
export interface TemplateFile {
    file_path: string;
    content: string;
    file_type: 'javascript' | 'typescript' | 'css' | 'html' | 'json' | 'markdown' | 'text';
}
export declare class TemplateService {
    /**
     * Get template files for a specific project type
     */
    getTemplateFiles(templateType: string): TemplateFile[];
    /**
     * React template with Vite
     */
    private getReactTemplate;
    /**
     * React Native template
     */
    private getReactNativeTemplate;
    /**
     * Next.js template
     */
    private getNextTemplate;
    /**
     * Vue template
     */
    private getVueTemplate;
    /**
     * Svelte template
     */
    private getSvelteTemplate;
    /**
     * Convert template files to project file format for database storage
     */
    convertToProjectFiles(templateFiles: TemplateFile[], projectId: string): Omit<ProjectFile, 'id' | 'created_at' | 'updated_at'>[];
    /**
     * Get supported template types
     */
    getSupportedTemplateTypes(): string[];
    /**
     * Check if a template type is supported
     */
    isTemplateTypeSupported(templateType: string): boolean;
}
//# sourceMappingURL=template-service.d.ts.map