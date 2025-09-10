/**
 * Shadcn-inspired UI components adapted for Obsidian
 * These components follow shadcn design patterns while working with Obsidian's DOM API
 */

import { App } from 'obsidian';

/**
 * Color palette based on shadcn's design system
 */
export const colors = {
  primary: {
    DEFAULT: 'hsl(222.2, 47.4%, 11.2%)',
    foreground: 'hsl(210, 40%, 98%)',
  },
  secondary: {
    DEFAULT: 'hsl(210, 40%, 96.1%)',
    foreground: 'hsl(222.2, 47.4%, 11.2%)',
  },
  muted: {
    DEFAULT: 'hsl(210, 40%, 96.1%)',
    foreground: 'hsl(215.4, 16.3%, 46.9%)',
  },
  accent: {
    DEFAULT: 'hsl(210, 40%, 96.1%)',
    foreground: 'hsl(222.2, 47.4%, 11.2%)',
  },
  destructive: {
    DEFAULT: 'hsl(0, 84.2%, 60.2%)',
    foreground: 'hsl(210, 40%, 98%)',
  },
  border: 'hsl(214.3, 31.8%, 91.4%)',
  ring: 'hsl(215, 20.2%, 65.1%)',
};

/**
 * Base component class for shadcn-style components
 */
export abstract class ShadcnComponent {
  protected containerEl: HTMLElement;
  protected app: App | null;

  constructor(containerEl: HTMLElement, app?: App) {
    this.containerEl = containerEl;
    this.app = app || null;
  }

  abstract render(): void;

  protected addClass(className: string): void {
    this.containerEl.addClass(className);
  }

  protected setStyles(styles: Record<string, string>): void {
    Object.entries(styles).forEach(([key, value]) => {
      this.containerEl.style.setProperty(key, value);
    });
  }
}

/**
 * Card component with shadcn styling
 */
export class Card extends ShadcnComponent {
  private title: string;
  private description?: string;
  private content?: HTMLElement | string;
  private footer?: HTMLElement | string;
  private actions?: Array<{ label: string; onClick: () => void; variant?: 'primary' | 'secondary' | 'destructive' }>;

  constructor(
    containerEl: HTMLElement,
    options: {
      title: string;
      description?: string;
      content?: HTMLElement | string;
      footer?: HTMLElement | string;
      actions?: Array<{ label: string; onClick: () => void; variant?: 'primary' | 'secondary' | 'destructive' }>;
    }
  ) {
    super(containerEl);
    this.title = options.title;
    this.description = options.description;
    this.content = options.content;
    this.footer = options.footer;
    this.actions = options.actions;
  }

  render(): void {
    this.containerEl.empty();
    this.addClass('shadcn-card');
    
    // Card styling
    this.setStyles({
      'border-radius': '0.5rem',
      'border': '1px solid var(--background-modifier-border)',
      'background': 'var(--background-primary)',
      'box-shadow': '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
      'overflow': 'hidden',
      'transition': 'all 0.2s ease',
    });

    // Card header
    const header = this.containerEl.createDiv({ cls: 'shadcn-card-header' });
    header.style.padding = '1.5rem';
    header.style.borderBottom = '1px solid var(--background-modifier-border)';

    const titleEl = header.createEl('h3', { text: this.title, cls: 'shadcn-card-title' });
    titleEl.style.fontSize = '1.125rem';
    titleEl.style.fontWeight = '600';
    titleEl.style.lineHeight = '1.25rem';
    titleEl.style.marginBottom = '0.5rem';

    if (this.description) {
      const descEl = header.createEl('p', { text: this.description, cls: 'shadcn-card-description' });
      descEl.style.fontSize = '0.875rem';
      descEl.style.color = 'var(--text-muted)';
      descEl.style.lineHeight = '1.25rem';
    }

    // Card content
    if (this.content) {
      const contentEl = this.containerEl.createDiv({ cls: 'shadcn-card-content' });
      contentEl.style.padding = '1.5rem';
      
      if (typeof this.content === 'string') {
        contentEl.innerHTML = this.content;
      } else {
        contentEl.appendChild(this.content);
      }
    }

    // Card footer with actions
    if (this.footer || this.actions) {
      const footerEl = this.containerEl.createDiv({ cls: 'shadcn-card-footer' });
      footerEl.style.padding = '1.5rem';
      footerEl.style.paddingTop = '0';
      footerEl.style.display = 'flex';
      footerEl.style.gap = '0.5rem';
      footerEl.style.justifyContent = 'flex-end';

      if (this.footer) {
        if (typeof this.footer === 'string') {
          footerEl.innerHTML = this.footer;
        } else {
          footerEl.appendChild(this.footer);
        }
      }

      if (this.actions) {
        this.actions.forEach(action => {
          const button = new Button(footerEl.createDiv(), {
            label: action.label,
            onClick: action.onClick,
            variant: action.variant || 'primary',
          });
          button.render();
        });
      }
    }

    // Hover effect
    this.containerEl.addEventListener('mouseenter', () => {
      this.containerEl.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
      this.containerEl.style.transform = 'translateY(-2px)';
    });

    this.containerEl.addEventListener('mouseleave', () => {
      this.containerEl.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)';
      this.containerEl.style.transform = 'translateY(0)';
    });
  }
}

/**
 * Button component with shadcn styling
 */
export class Button extends ShadcnComponent {
  private label: string;
  private onClick: () => void;
  private variant: 'primary' | 'secondary' | 'destructive' | 'outline' | 'ghost';
  private size: 'sm' | 'md' | 'lg';
  private disabled: boolean;
  private icon?: string;

  constructor(
    containerEl: HTMLElement,
    options: {
      label: string;
      onClick: () => void;
      variant?: 'primary' | 'secondary' | 'destructive' | 'outline' | 'ghost';
      size?: 'sm' | 'md' | 'lg';
      disabled?: boolean;
      icon?: string;
    }
  ) {
    super(containerEl);
    this.label = options.label;
    this.onClick = options.onClick;
    this.variant = options.variant || 'primary';
    this.size = options.size || 'md';
    this.disabled = options.disabled || false;
    this.icon = options.icon;
  }

  render(): void {
    this.containerEl.empty();
    
    const button = this.containerEl.createEl('button', {
      text: this.label,
      cls: `shadcn-button shadcn-button-${this.variant} shadcn-button-${this.size}`,
    });

    if (this.icon) {
      const iconEl = button.createSpan({ cls: 'shadcn-button-icon' });
      iconEl.innerHTML = this.icon;
      iconEl.style.marginRight = '0.5rem';
    }

    // Base button styles
    const baseStyles: Record<string, string> = {
      'display': 'inline-flex',
      'align-items': 'center',
      'justify-content': 'center',
      'border-radius': '0.375rem',
      'font-weight': '500',
      'transition': 'all 0.15s ease',
      'cursor': this.disabled ? 'not-allowed' : 'pointer',
      'opacity': this.disabled ? '0.5' : '1',
      'border': 'none',
      'outline': 'none',
    };

    // Size-specific styles
    const sizeStyles: Record<string, Record<string, string>> = {
      sm: { 'padding': '0.25rem 0.75rem', 'font-size': '0.875rem' },
      md: { 'padding': '0.5rem 1rem', 'font-size': '0.875rem' },
      lg: { 'padding': '0.75rem 1.5rem', 'font-size': '1rem' },
    };

    // Variant-specific styles
    const variantStyles: Record<string, Record<string, string>> = {
      primary: {
        'background': 'var(--interactive-accent)',
        'color': 'white',
      },
      secondary: {
        'background': 'var(--background-secondary)',
        'color': 'var(--text-normal)',
      },
      destructive: {
        'background': '#ef4444',
        'color': 'white',
      },
      outline: {
        'background': 'transparent',
        'color': 'var(--text-normal)',
        'border': '1px solid var(--background-modifier-border)',
      },
      ghost: {
        'background': 'transparent',
        'color': 'var(--text-normal)',
      },
    };

    // Apply styles
    Object.assign(button.style, baseStyles, sizeStyles[this.size], variantStyles[this.variant]);

    // Hover effects
    button.addEventListener('mouseenter', () => {
      if (!this.disabled) {
        button.style.opacity = '0.9';
        button.style.transform = 'translateY(-1px)';
      }
    });

    button.addEventListener('mouseleave', () => {
      if (!this.disabled) {
        button.style.opacity = '1';
        button.style.transform = 'translateY(0)';
      }
    });

    // Click handler
    if (!this.disabled) {
      button.addEventListener('click', this.onClick);
    }
  }
}

/**
 * Progress bar component with shadcn styling
 */
export class Progress extends ShadcnComponent {
  private value: number;
  private max: number;
  private showLabel: boolean;
  private color?: string;
  private animated: boolean;

  constructor(
    containerEl: HTMLElement,
    options: {
      value: number;
      max?: number;
      showLabel?: boolean;
      color?: string;
      animated?: boolean;
    }
  ) {
    super(containerEl);
    this.value = options.value;
    this.max = options.max || 100;
    this.showLabel = options.showLabel || false;
    this.color = options.color;
    this.animated = options.animated !== false;
  }

  render(): void {
    this.containerEl.empty();
    this.addClass('shadcn-progress');

    const progressContainer = this.containerEl.createDiv({ cls: 'shadcn-progress-container' });
    progressContainer.style.width = '100%';
    progressContainer.style.height = '0.5rem';
    progressContainer.style.backgroundColor = 'var(--background-modifier-border)';
    progressContainer.style.borderRadius = '9999px';
    progressContainer.style.overflow = 'hidden';
    progressContainer.style.position = 'relative';

    const progressBar = progressContainer.createDiv({ cls: 'shadcn-progress-bar' });
    const percentage = (this.value / this.max) * 100;
    progressBar.style.width = `${percentage}%`;
    progressBar.style.height = '100%';
    progressBar.style.backgroundColor = this.color || 'var(--interactive-accent)';
    progressBar.style.transition = this.animated ? 'width 0.3s ease' : 'none';
    progressBar.style.borderRadius = '9999px';

    // Animated pulse effect
    if (this.animated && percentage > 0 && percentage < 100) {
      progressBar.style.animation = 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite';
    }

    if (this.showLabel) {
      const label = this.containerEl.createDiv({ cls: 'shadcn-progress-label' });
      label.style.marginTop = '0.5rem';
      label.style.fontSize = '0.875rem';
      label.style.color = 'var(--text-muted)';
      label.style.textAlign = 'center';
      label.textContent = `${Math.round(percentage)}%`;
    }
  }

  updateValue(value: number): void {
    this.value = value;
    this.render();
  }
}

/**
 * Alert component with shadcn styling
 */
export class Alert extends ShadcnComponent {
  private title: string;
  private description?: string;
  private variant: 'default' | 'destructive' | 'warning' | 'success';
  private icon?: string;
  private dismissible: boolean;
  private onDismiss?: () => void;

  constructor(
    containerEl: HTMLElement,
    options: {
      title: string;
      description?: string;
      variant?: 'default' | 'destructive' | 'warning' | 'success';
      icon?: string;
      dismissible?: boolean;
      onDismiss?: () => void;
    }
  ) {
    super(containerEl);
    this.title = options.title;
    this.description = options.description;
    this.variant = options.variant || 'default';
    this.icon = options.icon;
    this.dismissible = options.dismissible || false;
    this.onDismiss = options.onDismiss;
  }

  render(): void {
    this.containerEl.empty();
    this.addClass('shadcn-alert');
    this.addClass(`shadcn-alert-${this.variant}`);

    const variantStyles: Record<string, Record<string, string>> = {
      default: {
        'background': 'var(--background-primary)',
        'border': '1px solid var(--background-modifier-border)',
        'color': 'var(--text-normal)',
      },
      destructive: {
        'background': '#fef2f2',
        'border': '1px solid #fecaca',
        'color': '#991b1b',
      },
      warning: {
        'background': '#fffbeb',
        'border': '1px solid #fde68a',
        'color': '#92400e',
      },
      success: {
        'background': '#f0fdf4',
        'border': '1px solid #bbf7d0',
        'color': '#166534',
      },
    };

    this.setStyles({
      'border-radius': '0.5rem',
      'padding': '1rem',
      'position': 'relative',
      'display': 'flex',
      'gap': '0.75rem',
      ...variantStyles[this.variant],
    });

    // Icon
    if (this.icon) {
      const iconEl = this.containerEl.createDiv({ cls: 'shadcn-alert-icon' });
      iconEl.innerHTML = this.icon;
      iconEl.style.flexShrink = '0';
      iconEl.style.width = '1.25rem';
      iconEl.style.height = '1.25rem';
    }

    // Content
    const content = this.containerEl.createDiv({ cls: 'shadcn-alert-content' });
    content.style.flex = '1';

    const titleEl = content.createEl('h5', { text: this.title, cls: 'shadcn-alert-title' });
    titleEl.style.fontWeight = '500';
    titleEl.style.fontSize = '0.875rem';
    titleEl.style.lineHeight = '1.25rem';
    titleEl.style.marginBottom = this.description ? '0.25rem' : '0';

    if (this.description) {
      const descEl = content.createEl('p', { text: this.description, cls: 'shadcn-alert-description' });
      descEl.style.fontSize = '0.875rem';
      descEl.style.lineHeight = '1.25rem';
      descEl.style.opacity = '0.9';
    }

    // Dismiss button
    if (this.dismissible) {
      const dismissBtn = this.containerEl.createEl('button', { cls: 'shadcn-alert-dismiss' });
      dismissBtn.innerHTML = '×';
      dismissBtn.style.position = 'absolute';
      dismissBtn.style.top = '0.5rem';
      dismissBtn.style.right = '0.5rem';
      dismissBtn.style.background = 'transparent';
      dismissBtn.style.border = 'none';
      dismissBtn.style.fontSize = '1.25rem';
      dismissBtn.style.cursor = 'pointer';
      dismissBtn.style.opacity = '0.5';
      dismissBtn.style.transition = 'opacity 0.2s';

      dismissBtn.addEventListener('mouseenter', () => {
        dismissBtn.style.opacity = '1';
      });

      dismissBtn.addEventListener('mouseleave', () => {
        dismissBtn.style.opacity = '0.5';
      });

      dismissBtn.addEventListener('click', () => {
        this.containerEl.style.opacity = '0';
        this.containerEl.style.transform = 'translateX(100%)';
        setTimeout(() => {
          this.containerEl.remove();
          if (this.onDismiss) {
            this.onDismiss();
          }
        }, 300);
      });
    }

    // Entrance animation
    this.containerEl.style.animation = 'slideInRight 0.3s ease';
  }
}

/**
 * Badge component with shadcn styling
 */
export class Badge extends ShadcnComponent {
  private text: string;
  private variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';

  constructor(
    containerEl: HTMLElement,
    options: {
      text: string;
      variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';
    }
  ) {
    super(containerEl);
    this.text = options.text;
    this.variant = options.variant || 'default';
  }

  render(): void {
    this.containerEl.empty();
    
    const badge = this.containerEl.createEl('span', {
      text: this.text,
      cls: `shadcn-badge shadcn-badge-${this.variant}`,
    });

    const variantStyles: Record<string, Record<string, string>> = {
      default: {
        'background': 'var(--background-modifier-hover)',
        'color': 'var(--text-normal)',
      },
      secondary: {
        'background': 'var(--background-secondary)',
        'color': 'var(--text-muted)',
      },
      destructive: {
        'background': '#fef2f2',
        'color': '#991b1b',
      },
      outline: {
        'background': 'transparent',
        'color': 'var(--text-normal)',
        'border': '1px solid var(--background-modifier-border)',
      },
      success: {
        'background': '#f0fdf4',
        'color': '#166534',
      },
      warning: {
        'background': '#fffbeb',
        'color': '#92400e',
      },
    };

    Object.assign(badge.style, {
      'display': 'inline-flex',
      'align-items': 'center',
      'border-radius': '9999px',
      'padding': '0.125rem 0.625rem',
      'font-size': '0.75rem',
      'font-weight': '600',
      'line-height': '1rem',
      'transition': 'all 0.2s',
      ...variantStyles[this.variant],
    });
  }
}

/**
 * Tabs component with shadcn styling
 */
export class Tabs extends ShadcnComponent {
  private tabs: Array<{ id: string; label: string; content: HTMLElement | string }>;
  private activeTab: string;
  private onTabChange?: (tabId: string) => void;

  constructor(
    containerEl: HTMLElement,
    options: {
      tabs: Array<{ id: string; label: string; content: HTMLElement | string }>;
      activeTab?: string;
      onTabChange?: (tabId: string) => void;
    }
  ) {
    super(containerEl);
    this.tabs = options.tabs;
    this.activeTab = options.activeTab || (this.tabs[0]?.id || '');
    this.onTabChange = options.onTabChange;
  }

  render(): void {
    this.containerEl.empty();
    this.addClass('shadcn-tabs');

    // Tab list
    const tabList = this.containerEl.createDiv({ cls: 'shadcn-tabs-list' });
    tabList.style.display = 'inline-flex';
    tabList.style.alignItems = 'center';
    tabList.style.justifyContent = 'center';
    tabList.style.backgroundColor = 'var(--background-modifier-border)';
    tabList.style.padding = '0.25rem';
    tabList.style.borderRadius = '0.5rem';
    tabList.style.gap = '0.25rem';
    tabList.style.marginBottom = '1rem';

    // Tab triggers
    this.tabs.forEach(tab => {
      const trigger = tabList.createEl('button', {
        text: tab.label,
        cls: `shadcn-tab-trigger ${this.activeTab === tab.id ? 'active' : ''}`,
      });

      Object.assign(trigger.style, {
        'padding': '0.375rem 0.75rem',
        'border-radius': '0.375rem',
        'font-size': '0.875rem',
        'font-weight': '500',
        'transition': 'all 0.2s',
        'border': 'none',
        'cursor': 'pointer',
        'background': this.activeTab === tab.id ? 'var(--background-primary)' : 'transparent',
        'color': this.activeTab === tab.id ? 'var(--text-normal)' : 'var(--text-muted)',
        'box-shadow': this.activeTab === tab.id ? '0 1px 3px 0 rgba(0, 0, 0, 0.1)' : 'none',
      });

      trigger.addEventListener('click', () => {
        this.activeTab = tab.id;
        this.render();
        if (this.onTabChange) {
          this.onTabChange(tab.id);
        }
      });

      trigger.addEventListener('mouseenter', () => {
        if (this.activeTab !== tab.id) {
          trigger.style.backgroundColor = 'var(--background-modifier-hover)';
        }
      });

      trigger.addEventListener('mouseleave', () => {
        if (this.activeTab !== tab.id) {
          trigger.style.backgroundColor = 'transparent';
        }
      });
    });

    // Tab content
    const activeTabData = this.tabs.find(t => t.id === this.activeTab);
    if (activeTabData) {
      const content = this.containerEl.createDiv({ cls: 'shadcn-tab-content' });
      content.style.animation = 'fadeIn 0.2s ease';
      
      if (typeof activeTabData.content === 'string') {
        content.innerHTML = activeTabData.content;
      } else {
        content.appendChild(activeTabData.content);
      }
    }
  }
}

/**
 * Add global styles for animations
 */
export function addGlobalStyles(): void {
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    @keyframes slideInRight {
      from {
        opacity: 0;
        transform: translateX(1rem);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }
    
    @keyframes fadeIn {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
    
    @keyframes pulse {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: 0.5;
      }
    }
    
    .shadcn-card:hover {
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    }
    
    .shadcn-button:active {
      transform: scale(0.98);
    }
    
    .shadcn-button:focus-visible {
      outline: 2px solid var(--interactive-accent);
      outline-offset: 2px;
    }
  `;
  document.head.appendChild(styleEl);
}