import { Check, Loader2, AlertCircle } from 'lucide-react';
import type { StepState } from '../types';
import { cn } from '../lib/utils';

interface StepperProps {
  steps: StepState[];
  currentStep: string;
}

export function Stepper({ steps, currentStep }: StepperProps) {
  return (
    <nav aria-label="Workflow progress" className="flex items-center gap-1.5 sm:gap-2">
      {steps.map((step, idx) => {
        const isLast = idx === steps.length - 1;
        const isCompleted = step.status === 'completed';
        const isProcessing = step.status === 'processing';
        const isActive = step.id === currentStep;

        return (
          <div key={step.id} className="flex flex-1 items-center">
            <div className="flex flex-col items-center gap-1.5 min-w-0">
              <div
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-xl border-2 transition-all duration-300 shrink-0',
                  isCompleted && 'border-success-500 bg-success-500/10',
                  isProcessing && 'border-primary-500 bg-primary-500/10',
                  isActive && !isProcessing && 'border-primary-500 bg-primary-500/5',
                  !isCompleted && !isProcessing && !isActive && 'border-neutral-700 bg-neutral-900'
                )}
              >
                {isCompleted ? (
                  <Check className="h-4.5 w-4.5 text-success-400" />
                ) : isProcessing ? (
                  <Loader2 className="h-4.5 w-4.5 animate-spin text-primary-400" />
                ) : step.status === 'error' ? (
                  <AlertCircle className="h-4.5 w-4.5 text-error-400" />
                ) : (
                  <span className="text-xs font-semibold text-neutral-400">{idx + 1}</span>
                )}
              </div>
              <span
                className={cn(
                  'hidden text-[11px] font-medium transition-colors sm:block truncate',
                  isCompleted && 'text-success-300',
                  isProcessing && 'text-primary-300',
                  isActive && !isProcessing && 'text-primary-200',
                  !isCompleted && !isProcessing && !isActive && 'text-neutral-500'
                )}
              >
                {step.label}
              </span>
            </div>
            {!isLast && (
              <div className="flex-1 h-0.5 mx-1 sm:mx-2 rounded-full bg-neutral-800 overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    isCompleted ? 'bg-success-500 w-full' : 'bg-transparent w-0'
                  )}
                />
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
