"use client";

import React, { useEffect, useRef, useState } from "react";

interface FadeInProps {
  children: React.ReactNode;
  delay?: number;
  direction?: "up" | "down" | "left" | "right" | "none";
  className?: string;
}

export function FadeIn({
  children,
  delay = 0,
  direction = "up",
  className = "",
}: FadeInProps) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (ref.current) observer.unobserve(ref.current);
        }
      },
      { threshold: 0.1 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  const getDirectionClass = () => {
    if (!isVisible) {
      switch (direction) {
        case "up":
          return "translate-y-6 opacity-0";
        case "down":
          return "-translate-y-6 opacity-0";
        case "left":
          return "translate-x-6 opacity-0";
        case "right":
          return "-translate-x-6 opacity-0";
        default:
          return "opacity-0";
      }
    }
    return "translate-y-0 translate-x-0 opacity-100";
  };

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out transform ${getDirectionClass()} ${className}`}
    >
      {children}
    </div>
  );
}
