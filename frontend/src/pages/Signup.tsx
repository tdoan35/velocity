import React from 'react';
import { AuroraBackground } from '../components/ui/aurora-background';
import { SignupForm } from '../components/ui/signup-form';
import { MovingBorderWrapper } from '../components/ui/moving-border';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export const Signup = () => {
  return (
    <AuroraBackground>
      <div className="min-h-screen flex flex-col items-center justify-center relative z-10 px-4">
        {/* Back to home button */}
        <Link to="/" className="absolute top-8 left-8">
          <MovingBorderWrapper
            borderRadius="0.5rem"
            className="bg-white/10 backdrop-blur-sm text-white border-neutral-200/20"
            containerClassName="p-0"
          >
            <div className="px-4 py-2 flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Back to Home</span>
            </div>
          </MovingBorderWrapper>
        </Link>

        {/* Signup Form */}
        <div className="w-full max-w-md">
          <SignupForm />
        </div>

        {/* Already have an account link */}
        <p className="mt-8 text-sm text-neutral-600 dark:text-neutral-400">
          Already have an account?{' '}
          <Link to="/login" className="text-neutral-800 dark:text-neutral-200 font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuroraBackground>
  );
};