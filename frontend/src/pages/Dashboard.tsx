import React from "react";
import { motion } from "motion/react";
import { useAuthStore } from "@/stores/useAuthStore";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Rocket, Code2, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function Dashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const stats = [
    { label: "Apps Created", value: "0", icon: Rocket },
    { label: "Active Projects", value: "0", icon: Code2 },
    { label: "Team Members", value: "1", icon: Users },
    { label: "AI Credits", value: "100", icon: Sparkles },
  ];

  return (
    <div className="flex h-full w-full flex-col gap-6 p-2 md:p-10">
      {/* Welcome Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          Welcome back{user?.email ? `, ${user.email.split('@')[0]}` : ""}!
        </h1>
        <p className="text-muted-foreground mt-2">
          Ready to build something amazing today?
        </p>
      </motion.div>

      {/* Stats Grid */}
      <motion.div 
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        {stats.map((stat, idx) => (
          <Card key={idx} className="hover:shadow-lg transition-shadow duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.label}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>
              Jump right into building your next app
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            <Button 
              onClick={() => navigate("/")}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Create New App
            </Button>
            <Button 
              variant="outline"
              onClick={() => navigate("/apps")}
            >
              <Rocket className="mr-2 h-4 w-4" />
              View My Apps
            </Button>
            <Button 
              variant="outline"
              onClick={() => navigate("/editor")}
            >
              <Code2 className="mr-2 h-4 w-4" />
              Open Editor
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      {/* Recent Activity */}
      <motion.div 
        className="flex-1"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Your latest projects and updates
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-40 text-muted-foreground">
              <p>No recent activity yet. Start by creating your first app!</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}