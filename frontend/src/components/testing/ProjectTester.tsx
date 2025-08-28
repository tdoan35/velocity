import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { TEST_SCENARIOS, TEST_PROJECT_IDS, logProjectLoadingStatus } from '../../utils/testProjectUtils';
import { ExternalLink, FileText, Database, Zap } from 'lucide-react';

export function ProjectTester() {
  const navigate = useNavigate();

  const handleTestScenario = (projectId: string, scenarioName: string) => {
    logProjectLoadingStatus(projectId, scenarioName);
    navigate(`/project/${projectId}/editor`);
  };

  const getScenarioIcon = (scenarioName: string) => {
    if (scenarioName.includes('Empty')) return <FileText className="h-4 w-4" />;
    if (scenarioName.includes('Non-Existent')) return <Zap className="h-4 w-4" />;
    if (scenarioName.includes('Demo')) return <ExternalLink className="h-4 w-4" />;
    if (scenarioName.includes('Full-Stack')) return <Database className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };

  const getScenarioBadgeVariant = (scenarioName: string) => {
    if (scenarioName.includes('Empty')) return 'secondary' as const;
    if (scenarioName.includes('Non-Existent')) return 'destructive' as const;
    if (scenarioName.includes('Demo')) return 'default' as const;
    if (scenarioName.includes('Full-Stack')) return 'outline' as const;
    return 'secondary' as const;
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold mb-4">Project Editor Tester</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Test different project loading scenarios to ensure the Project Editor handles 
            various states correctly, including empty projects, non-existent projects, 
            and projects with existing files.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {Object.entries(TEST_SCENARIOS).map(([scenarioName, scenario]) => {
            const projectId = scenario.url.split('/')[2]; // Extract project ID from URL
            
            return (
              <Card key={scenarioName} className="relative">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      {getScenarioIcon(scenarioName)}
                      {scenarioName}
                    </CardTitle>
                    <Badge variant={getScenarioBadgeVariant(scenarioName)}>
                      {projectId}
                    </Badge>
                  </div>
                  <CardDescription>
                    {scenario.description}
                  </CardDescription>
                </CardHeader>
                
                <CardContent>
                  <div className="space-y-4">
                    <div className="text-sm">
                      <strong>Expected Behavior:</strong>
                      <p className="text-muted-foreground mt-1">
                        {scenario.expectedBehavior}
                      </p>
                    </div>
                    
                    <div className="text-sm">
                      <strong>Test URL:</strong>
                      <code className="block mt-1 p-2 bg-muted rounded text-xs">
                        {scenario.url}
                      </code>
                    </div>
                    
                    <Button 
                      onClick={() => handleTestScenario(projectId, scenarioName)}
                      className="w-full"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Test This Scenario
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="mt-12 p-6 bg-muted/50 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Testing Instructions</h2>
          <div className="space-y-2 text-sm">
            <p>1. <strong>Open Developer Tools</strong> (F12) to see console logs</p>
            <p>2. <strong>Click a test scenario</strong> above to navigate to that project</p>
            <p>3. <strong>Observe the behavior</strong> - should no longer see "Loading Project..."</p>
            <p>4. <strong>Check console logs</strong> for project initialization details</p>
            <p>5. <strong>Verify files loaded</strong> - should see files in the file explorer</p>
            <p>6. <strong>Test editor functionality</strong> - try opening and editing files</p>
          </div>
        </div>

        <div className="mt-8 p-6 border rounded-lg">
          <h3 className="text-lg font-semibold mb-4">Quick Test URLs</h3>
          <div className="grid gap-2 font-mono text-sm">
            {Object.entries(TEST_SCENARIOS).map(([scenarioName, scenario]) => (
              <div key={scenarioName} className="flex items-center justify-between p-2 bg-muted rounded">
                <span>{scenarioName}:</span>
                <code className="text-primary">{scenario.url}</code>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}