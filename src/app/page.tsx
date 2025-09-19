"use client";

import Link from "next/link";
import { BookOpen, Volume2, Star, Heart, QrCode, Users, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-100 via-purple-50 to-blue-100 relative overflow-hidden">
      {/* Floating decorative elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-10 left-10 text-yellow-400 animate-bounce">
          <Star className="w-8 h-8" fill="currentColor" />
        </div>
        <div className="absolute top-20 right-20 text-pink-400 animate-pulse">
          <Heart className="w-6 h-6" fill="currentColor" />
        </div>
        <div className="absolute bottom-20 left-16 text-purple-400 animate-bounce delay-300">
          <Sparkles className="w-10 h-10" fill="currentColor" />
        </div>
        <div className="absolute bottom-32 right-12 text-green-400 animate-pulse delay-500">
          <Star className="w-7 h-7" fill="currentColor" />
        </div>
        <div className="absolute top-1/2 left-8 text-blue-400 animate-bounce delay-700">
          <Heart className="w-5 h-5" fill="currentColor" />
        </div>
        <div className="absolute top-1/3 right-8 text-orange-400 animate-pulse delay-1000">
          <Sparkles className="w-6 h-6" fill="currentColor" />
        </div>
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-4">
        {/* Main Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="p-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full animate-pulse">
              <BookOpen className="w-12 h-12 text-white" />
            </div>
            <div className="p-3 bg-gradient-to-r from-blue-500 to-green-500 rounded-full animate-pulse delay-300">
              <Volume2 className="w-12 h-12 text-white" />
            </div>
          </div>

          <h1 className="text-6xl font-bold bg-gradient-to-r from-purple-600 via-pink-500 to-blue-600 bg-clip-text text-transparent mb-4 animate-pulse">
            Reading Fun!
          </h1>

          <p className="text-2xl text-gray-700 font-semibold mb-2">
            🌟 Practice Reading Stories Out Loud! 🌟
          </p>

          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            A magical place where little readers can practice their stories,
            record their voices, and share their reading adventures! ✨
          </p>
        </div>

        {/* Cards Section */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl w-full">
          {/* Teacher Card */}
          <Card className="border-4 border-purple-300 bg-white/90 backdrop-blur-sm shadow-2xl hover:shadow-3xl transition-all duration-300 hover:scale-105">
            <CardHeader className="text-center bg-gradient-to-r from-purple-100 to-pink-100 rounded-t-lg">
              <div className="mx-auto mb-4 p-4 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full w-fit">
                <Users className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-2xl font-bold text-purple-700">
                👩‍🏫 For Teachers 👨‍🏫
              </CardTitle>
              <CardDescription className="text-lg text-gray-700">
                Create magical reading assignments for your students!
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 text-center">
              <p className="text-gray-600 mb-6 text-lg">
                📚 Upload stories, assign them to your class, and listen to your students'
                wonderful reading recordings!
              </p>
              <Link href="/login">
                <Button
                  size="lg"
                  className="w-full text-xl py-6 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold shadow-lg hover:shadow-xl transition-all duration-300"
                >
                  🚀 Teacher Login
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Student Card */}
          <Card className="border-4 border-blue-300 bg-white/90 backdrop-blur-sm shadow-2xl hover:shadow-3xl transition-all duration-300 hover:scale-105">
            <CardHeader className="text-center bg-gradient-to-r from-blue-100 to-green-100 rounded-t-lg">
              <div className="mx-auto mb-4 p-4 bg-gradient-to-r from-blue-500 to-green-500 rounded-full w-fit">
                <QrCode className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-2xl font-bold text-blue-700">
                🎈 For Students 🎉
              </CardTitle>
              <CardDescription className="text-lg text-gray-700">
                Join your class with a special link or QR code!
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 text-center space-y-4">
              <p className="text-gray-600 text-lg">
                🎯 Ask your teacher for your special class link or QR code to get started!
              </p>

              <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
                <p className="text-blue-800 font-semibold text-lg mb-2">
                  📱 How to Join:
                </p>
                <ul className="text-blue-700 space-y-2 text-left">
                  <li>✨ Scan the QR code your teacher shows you</li>
                  <li>🔗 Or click the special link they give you</li>
                  <li>🎨 Choose your fun visual password</li>
                  <li>📖 Start reading amazing stories!</li>
                </ul>
              </div>

              <div className="bg-gradient-to-r from-yellow-100 to-orange-100 border-2 border-yellow-300 rounded-lg p-4">
                <p className="text-orange-800 font-bold text-lg">
                  🌟 No password needed - just pictures! 🌟
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Fun Footer */}
        <div className="mt-12 text-center">
          <p className="text-xl text-gray-600 font-medium">
            🎭 Where reading comes alive with your voice! 🎭
          </p>
          <div className="flex justify-center gap-4 mt-4 text-3xl">
            <span className="animate-bounce">📚</span>
            <span className="animate-bounce delay-100">🎤</span>
            <span className="animate-bounce delay-200">🌈</span>
            <span className="animate-bounce delay-300">⭐</span>
            <span className="animate-bounce delay-400">🎨</span>
          </div>
        </div>
      </div>
    </div>
  );
}
