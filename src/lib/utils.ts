import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const PROTECTED_BRANCH_NAMES = new Set(["main", "master"]);

export function isProtectedBranch(name: string): boolean {
  return PROTECTED_BRANCH_NAMES.has(name);
}
