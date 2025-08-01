"use client";
import React from "react";
import { Label } from "./label";
import { Input } from "./input";
import { cn } from "../../lib/utils";
import { X, Mail } from "lucide-react";
import {
  IconBrandGithub,
  IconBrandGoogle,
} from "@tabler/icons-react";
import { motion, AnimatePresence } from "framer-motion";

interface SignupFormProps {
  mode?: 'signup' | 'login';
  onClose?: () => void;
  onModeSwitch?: (mode: 'signup' | 'login') => void;
}

export function SignupForm({ mode = 'signup', onClose, onModeSwitch }: SignupFormProps) {
  const [showEmailForm, setShowEmailForm] = React.useState(false);
  const [agreedToTerms, setAgreedToTerms] = React.useState(true);
  
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log("Form submitted");
  };
  
  const handleBackToOptions = () => {
    setShowEmailForm(false);
  };
  
  return (
    <div className="shadow-input mx-auto w-full max-w-md rounded-none bg-white p-4 md:rounded-2xl md:p-8 md:pb-10 dark:bg-black relative">
      {/* Close button */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-2 right-2 md:top-2 md:right-2 rounded-full bg-neutral-100 dark:bg-neutral-800 p-2 text-neutral-500 dark:text-neutral-400 transition-all hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:text-neutral-700 dark:hover:text-neutral-200"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      
      <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-200">
        ✨ Welcome to Velocity
      </h2>
      <p className="mt-2 max-w-sm text-sm text-neutral-600 dark:text-neutral-300">
        {mode === 'signup' ? 'Create your account to start building' : 'Login to your account to start building'}
      </p>

      <AnimatePresence mode="wait">
        {!showEmailForm ? (
          // Auth options
          <motion.div
            key="auth-options"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="mt-8 flex flex-col space-y-4"
          >
          <button
            className="group/btn shadow-input relative flex h-10 w-full items-center justify-start space-x-2 rounded-md bg-gray-50 px-4 font-medium text-black dark:bg-zinc-900 dark:shadow-[0px_0px_1px_1px_#262626]"
            type="button"
          >
            <IconBrandGoogle className="h-4 w-4 text-neutral-800 dark:text-neutral-300" />
            <span className="text-sm text-neutral-700 dark:text-neutral-300">
              Continue with Google
            </span>
            <BottomGradient />
          </button>
          
          <button
            className="group/btn shadow-input relative flex h-10 w-full items-center justify-start space-x-2 rounded-md bg-gray-50 px-4 font-medium text-black dark:bg-zinc-900 dark:shadow-[0px_0px_1px_1px_#262626]"
            type="button"
          >
            <IconBrandGithub className="h-4 w-4 text-neutral-800 dark:text-neutral-300" />
            <span className="text-sm text-neutral-700 dark:text-neutral-300">
              Continue with GitHub
            </span>
            <BottomGradient />
          </button>
          
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-neutral-300 dark:border-neutral-700" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white dark:bg-black px-2 text-neutral-500 dark:text-neutral-400">
                or
              </span>
            </div>
          </div>
          
          <button
            className="group/btn shadow-input relative flex h-10 w-full items-center justify-start space-x-2 rounded-md bg-gray-50 px-4 font-medium text-black dark:bg-zinc-900 dark:shadow-[0px_0px_1px_1px_#262626]"
            type="button"
            onClick={() => setShowEmailForm(true)}
          >
            <Mail className="h-4 w-4 text-neutral-800 dark:text-neutral-300" />
            <span className="text-sm text-neutral-700 dark:text-neutral-300">
              {mode === 'signup' ? 'Sign up with email and password' : 'Login with email and password'}
            </span>
            <BottomGradient />
          </button>
          </motion.div>
        ) : (
          // Email form
          <motion.form
            key="email-form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="mt-8"
            onSubmit={handleSubmit}
          >
          {mode === 'signup' && (
            <div className="mb-4 flex flex-col space-y-2 md:flex-row md:space-y-0 md:space-x-2">
              <LabelInputContainer>
                <Label htmlFor="firstname">First name</Label>
                <Input id="firstname" placeholder="John" type="text" />
              </LabelInputContainer>
              <LabelInputContainer>
                <Label htmlFor="lastname">Last name</Label>
                <Input id="lastname" placeholder="Doe" type="text" />
              </LabelInputContainer>
            </div>
          )}
          <LabelInputContainer className="mb-4">
            <Label htmlFor="email">Email Address</Label>
            <Input id="email" placeholder="john@example.com" type="email" />
          </LabelInputContainer>
          <LabelInputContainer className={mode === 'signup' ? "mb-4" : "mb-8"}>
            <Label htmlFor="password">Password</Label>
            <Input id="password" placeholder="••••••••" type="password" />
          </LabelInputContainer>
          {mode === 'signup' && (
            <>
              <LabelInputContainer className="mb-4">
                <Label htmlFor="confirmpassword">Confirm Password</Label>
                <Input
                  id="confirmpassword"
                  placeholder="••••••••"
                  type="password"
                />
              </LabelInputContainer>

              <div className="mb-8 flex items-start space-x-2">
                <input
                  id="terms"
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                />
                <label htmlFor="terms" className="text-sm text-neutral-600 dark:text-neutral-400">
                  I agree to our{" "}
                  <a href="#" className="text-neutral-800 dark:text-neutral-200 underline hover:no-underline">
                    Terms of Service
                  </a>{" "}
                  and{" "}
                  <a href="#" className="text-neutral-800 dark:text-neutral-200 underline hover:no-underline">
                    Privacy Policy
                  </a>
                </label>
              </div>
            </>
          )}

          <button
            className="group/btn relative block h-10 w-full rounded-md bg-gradient-to-br from-black to-neutral-600 font-medium text-white shadow-[0px_1px_0px_0px_#ffffff40_inset,0px_-1px_0px_0px_#ffffff40_inset] dark:bg-zinc-800 dark:from-zinc-900 dark:to-zinc-900 dark:shadow-[0px_1px_0px_0px_#27272a_inset,0px_-1px_0px_0px_#27272a_inset]"
            type="submit"
          >
            {mode === 'signup' ? 'Sign up' : 'Log in'} &rarr;
            <BottomGradient />
          </button>
          
          <div className="mt-4 text-center">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {mode === 'signup' ? 'Already have an account?' : "Don't have an account?"}{" "}
              <button
                type="button"
                onClick={() => {
                  onModeSwitch?.(mode === 'signup' ? 'login' : 'signup');
                  // Keep the email form open when switching modes
                }}
                className="text-neutral-800 dark:text-neutral-200 font-medium hover:underline"
              >
                {mode === 'signup' ? 'Log in' : 'Sign up'}
              </button>
            </p>
          </div>
          
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={handleBackToOptions}
              className="text-sm text-neutral-600 dark:text-neutral-300 hover:text-neutral-800 dark:hover:text-neutral-100"
            >
              ← Back to {mode === 'signup' ? 'sign up' : 'login'} options
            </button>
          </div>
        </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

const BottomGradient = () => {
  return (
    <>
      <span className="absolute inset-x-0 -bottom-px block h-px w-full bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-0 transition duration-500 group-hover/btn:opacity-100" />
      <span className="absolute inset-x-10 -bottom-px mx-auto block h-px w-1/2 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-0 blur-sm transition duration-500 group-hover/btn:opacity-100" />
    </>
  );
};

const LabelInputContainer = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <div className={cn("flex w-full flex-col space-y-2", className)}>
      {children}
    </div>
  );
};