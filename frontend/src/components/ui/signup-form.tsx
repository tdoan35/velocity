"use client";
import React from "react";
import { Label } from "./label";
import { Input } from "./input";
import { cn } from "../../lib/utils";
import { X, Mail, Loader2 } from "lucide-react";
import {
  IconBrandGithub,
  IconBrandGoogle,
} from "@tabler/icons-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "../../hooks/use-toast";
import { authService } from "../../services/auth";
import { useAuthStore } from "../../stores/useAuthStore";
import { useNavigate } from "react-router-dom";

interface SignupFormProps {
  mode?: 'signup' | 'login';
  onClose?: () => void;
  onModeSwitch?: (mode: 'signup' | 'login') => void;
}

export function SignupForm({ mode = 'signup', onClose, onModeSwitch }: SignupFormProps) {
  const [showEmailForm, setShowEmailForm] = React.useState(false);
  const [agreedToTerms, setAgreedToTerms] = React.useState(true);
  const [isLoading, setIsLoading] = React.useState(false);
  const [loginError, setLoginError] = React.useState<string | null>(null);
  
  // Form state
  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  
  const { toast } = useToast();
  const navigate = useNavigate();
  const { setUser } = useAuthStore();
  
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Clear any previous errors
    setLoginError(null);
    
    // Validation
    if (mode === 'signup') {
      if (password !== confirmPassword) {
        toast({
          title: "Passwords don't match",
          description: "Please make sure your passwords match.",
          variant: "destructive",
        });
        return;
      }
      
      if (!agreedToTerms) {
        toast({
          title: "Terms not accepted",
          description: "Please accept the terms of service to continue.",
          variant: "destructive",
        });
        return;
      }
      
      if (password.length < 6) {
        toast({
          title: "Password too short",
          description: "Password must be at least 6 characters long.",
          variant: "destructive",
        });
        return;
      }
    }
    
    setIsLoading(true);
    
    try {
      if (mode === 'signup') {
        const { user, error } = await authService.signUp({
          email,
          password,
          firstName,
          lastName,
        });
        
        if (error) {
          toast({
            title: "Sign up failed",
            description: error.message,
            variant: "destructive",
          });
        } else if (user) {
          setUser(user);
          toast({
            title: "Account created!",
            description: "Please check your email to verify your account.",
          });
          onClose?.();
          // Skip navigation if there's a pending prompt — PendingPromptHandler will navigate after creating the project
          if (!sessionStorage.getItem('velocity_pending_prompt')) {
            navigate('/');
          }
        }
      } else {
        const { user, error } = await authService.login({
          email,
          password,
        });
        
        if (error) {
          let errorMessage = error.message;
          
          // Provide more specific error messages for common login errors
          if (error.message.toLowerCase().includes('invalid login credentials')) {
            errorMessage = "Invalid email or password. Please check your credentials and try again.";
          } else if (error.message.toLowerCase().includes('email not confirmed')) {
            errorMessage = "Please verify your email before logging in. Check your inbox for the verification link.";
          } else if (error.message.toLowerCase().includes('user not found')) {
            errorMessage = "No account found with this email. Please sign up first.";
          }
          
          setLoginError(errorMessage);
          toast({
            title: "Login failed",
            description: errorMessage,
            variant: "destructive",
          });
        } else if (user) {
          setUser(user);
          toast({
            title: "Welcome back!",
            description: "You have successfully logged in.",
          });
          onClose?.();
          // Skip navigation if there's a pending prompt — PendingPromptHandler will navigate after creating the project
          if (!sessionStorage.getItem('velocity_pending_prompt')) {
            navigate('/');
          }
        }
      }
    } catch (error) {
      toast({
        title: mode === 'signup' ? "Sign up failed" : "Login failed",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleGoogleAuth = async () => {
    setIsLoading(true);
    try {
      const { error } = await authService.loginWithGoogle();
      if (error) {
        toast({
          title: "Authentication failed",
          description: error.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Authentication failed",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleGitHubAuth = async () => {
    setIsLoading(true);
    try {
      const { error } = await authService.loginWithGitHub();
      if (error) {
        toast({
          title: "Authentication failed",
          description: error.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Authentication failed",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
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
            className="group/btn shadow-input relative flex h-10 w-full items-center justify-start space-x-2 rounded-md bg-gray-50 px-4 font-medium text-black dark:bg-zinc-900 dark:shadow-[0px_0px_1px_1px_#262626] disabled:opacity-50 disabled:cursor-not-allowed"
            type="button"
            onClick={handleGoogleAuth}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-neutral-800 dark:text-neutral-300" />
            ) : (
              <IconBrandGoogle className="h-4 w-4 text-neutral-800 dark:text-neutral-300" />
            )}
            <span className="text-sm text-neutral-700 dark:text-neutral-300">
              Continue with Google
            </span>
            <BottomGradient />
          </button>
          
          <button
            className="group/btn shadow-input relative flex h-10 w-full items-center justify-start space-x-2 rounded-md bg-gray-50 px-4 font-medium text-black dark:bg-zinc-900 dark:shadow-[0px_0px_1px_1px_#262626] disabled:opacity-50 disabled:cursor-not-allowed"
            type="button"
            onClick={handleGitHubAuth}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-neutral-800 dark:text-neutral-300" />
            ) : (
              <IconBrandGithub className="h-4 w-4 text-neutral-800 dark:text-neutral-300" />
            )}
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
                <Input 
                  id="firstname" 
                  placeholder="John" 
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={isLoading}
                />
              </LabelInputContainer>
              <LabelInputContainer>
                <Label htmlFor="lastname">Last name</Label>
                <Input 
                  id="lastname" 
                  placeholder="Doe" 
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  disabled={isLoading}
                />
              </LabelInputContainer>
            </div>
          )}
          <LabelInputContainer className="mb-4">
            <Label htmlFor="email">Email Address</Label>
            <Input 
              id="email" 
              placeholder="john@example.com" 
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setLoginError(null); // Clear error when user types
              }}
              disabled={isLoading}
              required
              className={loginError && mode === 'login' ? "border-red-500 focus:ring-red-500" : ""}
            />
          </LabelInputContainer>
          <LabelInputContainer className={mode === 'signup' ? "mb-4" : "mb-2"}>
            <Label htmlFor="password">Password</Label>
            <Input 
              id="password" 
              placeholder="••••••••" 
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setLoginError(null); // Clear error when user types
              }}
              disabled={isLoading}
              required
              className={loginError && mode === 'login' ? "border-red-500 focus:ring-red-500" : ""}
            />
          </LabelInputContainer>
          {mode === 'login' && (
            <>
              <div className="mb-2 text-right">
                <button
                  type="button"
                  onClick={() => {
                    toast({
                      title: "Password reset",
                      description: "Password reset functionality coming soon!",
                    });
                  }}
                  className="text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              {loginError && (
                <div className="mb-4 p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-600 dark:text-red-400">{loginError}</p>
                </div>
              )}
            </>
          )}
          {mode === 'signup' && (
            <>
              <LabelInputContainer className="mb-4">
                <Label htmlFor="confirmpassword">Confirm Password</Label>
                <Input
                  id="confirmpassword"
                  placeholder="••••••••"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isLoading}
                  required
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
            className="group/btn relative block h-10 w-full rounded-md bg-gradient-to-br from-black to-neutral-600 font-medium text-white shadow-[0px_1px_0px_0px_#ffffff40_inset,0px_-1px_0px_0px_#ffffff40_inset] dark:bg-zinc-800 dark:from-zinc-900 dark:to-zinc-900 dark:shadow-[0px_1px_0px_0px_#27272a_inset,0px_-1px_0px_0px_#27272a_inset] disabled:opacity-50 disabled:cursor-not-allowed"
            type="submit"
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {mode === 'signup' ? 'Signing up...' : 'Logging in...'}
              </span>
            ) : (
              <>{mode === 'signup' ? 'Sign up' : 'Log in'} &rarr;</>
            )}
            <BottomGradient />
          </button>
          
          <div className="mt-4 text-center">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {mode === 'signup' ? 'Already have an account?' : "Don't have an account?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setLoginError(null); // Clear any errors when switching modes
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