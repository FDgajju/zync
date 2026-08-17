import { AlertTriangle, Check, Info as InfoIcon, XCircle } from 'lucide-react';
import type { ToastType } from '../../store/toastSlice';
import { cn } from '../../lib/utils';

export function toastTypeIcon(type: ToastType, className = 'w-4 h-4 shrink-0') {
    if (type === 'success') return <Check className={cn(className, 'text-app-success')} />;
    if (type === 'error') return <XCircle className={cn(className, 'text-app-danger')} />;
    if (type === 'warning') return <AlertTriangle className={cn(className, 'text-app-warning')} />;
    return <InfoIcon className={cn(className, 'text-app-accent')} />;
}

export function toastAccentClass(type: ToastType): string {
    if (type === 'success') return 'border-l-app-success';
    if (type === 'error') return 'border-l-app-danger';
    if (type === 'warning') return 'border-l-app-warning';
    return 'border-l-app-accent';
}
