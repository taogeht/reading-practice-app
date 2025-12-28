"use client";

import Link from "next/link";
import Image from "next/image";
import {
  BookOpen,
  Mic,
  Users,
  BarChart3,
  Headphones,
  Shield,
  ArrowRight,
  CheckCircle2,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  {
    icon: BookOpen,
    title: "Story Library",
    description:
      "Create and manage reading content with built-in text-to-speech audio generation.",
  },
  {
    icon: Shield,
    title: "Visual Authentication",
    description:
      "Password-free login for young students using picture-based visual passwords.",
  },
  {
    icon: Mic,
    title: "Audio Recording",
    description:
      "Students record themselves reading aloud with real-time feedback and playback.",
  },
  {
    icon: BarChart3,
    title: "Progress Tracking",
    description:
      "Monitor student reading development with detailed analytics and scoring.",
  },
  {
    icon: Users,
    title: "Class Management",
    description:
      "Organize students into classes with easy enrollment and assignment distribution.",
  },
  {
    icon: Headphones,
    title: "Teacher Review",
    description:
      "Listen to student recordings and provide personalized feedback efficiently.",
  },
];

const steps = [
  {
    number: "01",
    title: "Create Stories",
    description: "Teachers add reading content and generate professional TTS audio.",
  },
  {
    number: "02",
    title: "Listen & Practice",
    description: "Students listen to the story, then practice reading along.",
  },
  {
    number: "03",
    title: "Record & Review",
    description: "Students record their reading. Teachers provide feedback.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md border-b border-slate-200 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-slate-900 rounded-lg">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <span className="font-semibold text-slate-900">ReadingPractice</span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/login">
                <Button variant="ghost" className="text-slate-600 hover:text-slate-900">
                  Teacher Login
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium">
                <Play className="w-4 h-4" />
                Reading Practice Platform for Schools
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 leading-tight">
                Help Students Master{" "}
                <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  Reading Aloud
                </span>
              </h1>

              <p className="text-xl text-slate-600 leading-relaxed max-w-lg">
                A comprehensive platform where teachers create assignments, students
                practice reading with audio guidance, and progress is tracked
                automatically.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/login">
                  <Button
                    size="lg"
                    className="bg-slate-900 hover:bg-slate-800 text-white px-8 h-12 text-base"
                  >
                    Teacher Login
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
                <a href="#features">
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-slate-300 text-slate-700 hover:bg-slate-50 px-8 h-12 text-base"
                  >
                    Explore Features
                  </Button>
                </a>
              </div>

              <div className="flex items-center gap-6 pt-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span className="text-slate-600 text-sm">Free for schools</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span className="text-slate-600 text-sm">No student passwords</span>
                </div>
              </div>
            </div>

            {/* Hero Image Placeholder */}
            <div className="relative">
              <div className="relative bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl shadow-2xl overflow-hidden aspect-[4/3]">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center p-8">
                    <div className="w-20 h-20 bg-slate-300 rounded-xl mx-auto mb-4 flex items-center justify-center">
                      <BookOpen className="w-10 h-10 text-slate-500" />
                    </div>
                    <p className="text-slate-500 font-medium">Dashboard Preview</p>
                    <p className="text-slate-400 text-sm mt-1">App screenshot coming soon</p>
                  </div>
                </div>
                {/* Decorative elements */}
                <div className="absolute -top-4 -right-4 w-24 h-24 bg-blue-500/10 rounded-full blur-xl" />
                <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-indigo-500/10 rounded-full blur-xl" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              Everything You Need for Reading Practice
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              A complete toolkit for teachers to manage reading assignments and track
              student progress with ease.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <Card
                key={feature.title}
                className="bg-white border-slate-200 hover:border-slate-300 hover:shadow-lg transition-all duration-300"
              >
                <CardContent className="p-6">
                  <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mb-4">
                    <feature.icon className="w-6 h-6 text-slate-700" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-slate-600 leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              How It Works
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              A simple three-step workflow that makes reading practice effective and
              engaging.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, index) => (
              <div key={step.number} className="relative">
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-12 left-1/2 w-full h-0.5 bg-slate-200" />
                )}
                <div className="relative bg-white rounded-2xl p-8 border border-slate-200 hover:shadow-lg transition-shadow">
                  <div className="text-5xl font-bold text-slate-200 mb-4">
                    {step.number}
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">
                    {step.title}
                  </h3>
                  <p className="text-slate-600">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* App Screenshots Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-900">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              See It In Action
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto">
              Designed for simplicity. Built for education.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { title: "Teacher Dashboard", desc: "Manage classes and view submissions" },
              { title: "Student Reading View", desc: "Listen to stories and practice" },
              { title: "Recording Interface", desc: "Simple recording with playback" },
            ].map((screen) => (
              <div
                key={screen.title}
                className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700"
              >
                <div className="aspect-video bg-slate-700/50 flex items-center justify-center">
                  <div className="text-center p-4">
                    <div className="w-12 h-12 bg-slate-600 rounded-lg mx-auto mb-3 flex items-center justify-center">
                      <BookOpen className="w-6 h-6 text-slate-400" />
                    </div>
                    <p className="text-slate-400 text-sm">Screenshot</p>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-white mb-1">{screen.title}</h3>
                  <p className="text-slate-400 text-sm">{screen.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Login Cards Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              Get Started
            </h2>
            <p className="text-lg text-slate-600">
              Choose your role to access the platform.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Teacher Card */}
            <Card className="border-slate-200 hover:border-blue-300 hover:shadow-xl transition-all duration-300 overflow-hidden">
              <CardContent className="p-8">
                <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center mb-6">
                  <Users className="w-7 h-7 text-blue-600" />
                </div>

                <h3 className="text-2xl font-bold text-slate-900 mb-3">For Teachers</h3>

                <p className="text-slate-600 mb-6 leading-relaxed">
                  Create stories, manage classes, assign reading tasks, and review
                  student recordings from your dashboard.
                </p>

                <ul className="space-y-3 mb-8">
                  <li className="flex items-center gap-3 text-slate-600">
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                    Text-to-speech audio generation
                  </li>
                  <li className="flex items-center gap-3 text-slate-600">
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                    Class and student management
                  </li>
                  <li className="flex items-center gap-3 text-slate-600">
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                    Recording review and feedback
                  </li>
                </ul>

                <Link href="/login">
                  <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 text-base">
                    Teacher Login
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {/* Student Card */}
            <Card className="border-slate-200 hover:border-indigo-300 hover:shadow-xl transition-all duration-300 overflow-hidden">
              <CardContent className="p-8">
                <div className="w-14 h-14 bg-indigo-100 rounded-xl flex items-center justify-center mb-6">
                  <Mic className="w-7 h-7 text-indigo-600" />
                </div>

                <h3 className="text-2xl font-bold text-slate-900 mb-3">For Students</h3>

                <p className="text-slate-600 mb-6 leading-relaxed">
                  Access your class using a special link or QR code from your teacher.
                  No password needed!
                </p>

                <div className="bg-slate-50 rounded-xl p-5 mb-6">
                  <h4 className="font-semibold text-slate-900 mb-3">How to Join:</h4>
                  <ol className="space-y-2 text-slate-600">
                    <li className="flex items-start gap-3">
                      <span className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center text-sm font-semibold text-indigo-600 flex-shrink-0">
                        1
                      </span>
                      Get the class link or QR code from your teacher
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center text-sm font-semibold text-indigo-600 flex-shrink-0">
                        2
                      </span>
                      Choose your avatar and picture password
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center text-sm font-semibold text-indigo-600 flex-shrink-0">
                        3
                      </span>
                      Start reading and recording!
                    </li>
                  </ol>
                </div>

                <div className="bg-indigo-50 rounded-lg p-4 text-center">
                  <p className="text-indigo-700 font-medium">
                    Visual password authentication — no typing required
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-slate-800 rounded-lg">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <span className="font-semibold text-white">ReadingPractice</span>
            </div>

            <p className="text-slate-400 text-sm">
              &copy; {new Date().getFullYear()} ReadingPractice. Built for education.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
