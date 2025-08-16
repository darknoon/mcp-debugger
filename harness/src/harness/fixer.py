"""Issue fixing logic for SWE-bench examples."""

import subprocess
import os
from pathlib import Path
from typing import Dict, Any, Optional, List


class IssueFixer:
    """Handles non-interactive fixing of SWE-bench issues."""
    
    def __init__(self, repo_path: Path):
        """Initialize the fixer with a repository path."""
        self.repo_path = repo_path
        self.original_cwd = os.getcwd()
    
    def apply_patch(self, patch_content: str) -> bool:
        """
        Apply a patch to the repository.
        
        Args:
            patch_content: The patch content as a string
            
        Returns:
            True if patch applied successfully
        """
        os.chdir(self.repo_path)
        
        try:
            # Write patch to temporary file
            patch_file = self.repo_path / "temp.patch"
            with open(patch_file, 'w') as f:
                f.write(patch_content)
            
            # Apply patch
            result = subprocess.run(
                ["git", "apply", "--whitespace=fix", str(patch_file)],
                capture_output=True,
                text=True
            )
            
            # Clean up patch file
            patch_file.unlink()
            
            if result.returncode == 0:
                print("Patch applied successfully")
                return True
            else:
                print(f"Patch application failed: {result.stderr}")
                return False
                
        except Exception as e:
            print(f"Error applying patch: {str(e)}")
            return False
        finally:
            os.chdir(self.original_cwd)
    
    def run_claude_code_fix(self, problem_statement: str) -> Optional[str]:
        """
        Run Claude Code non-interactively to fix the issue.
        
        Args:
            problem_statement: Description of the issue to fix
            
        Returns:
            Generated patch content or None if fix failed
        """
        os.chdir(self.repo_path)
        
        try:
            print("Running Claude Code to generate fix...")
            
            # Run claude code with the problem statement
            cmd = [
                "claude", 
                "--print",
                "--model", "sonnet",
                f"Fix this issue: {problem_statement}. Generate a patch for the changes."
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=600  # 10 minute timeout
            )
            
            if result.returncode == 0:
                print("Claude Code completed successfully")
                
                # Try to get the git diff as the patch
                diff_result = subprocess.run(
                    ["git", "diff"],
                    capture_output=True,
                    text=True
                )
                
                if diff_result.returncode == 0 and diff_result.stdout.strip():
                    return diff_result.stdout
                else:
                    print("No changes detected after Claude Code run")
                    return None
            else:
                print(f"Claude Code failed: {result.stderr}")
                return None
                
        except subprocess.TimeoutExpired:
            print("Claude Code execution timed out")
            return None
        except Exception as e:
            print(f"Error running Claude Code: {str(e)}")
            return None
        finally:
            os.chdir(self.original_cwd)
    
    def fix_issue(self, example: Dict[str, Any]) -> Dict[str, Any]:
        """
        Attempt to fix an issue from a SWE-bench example.
        
        Args:
            example: SWE-bench example dictionary
            
        Returns:
            Dictionary with fix results
        """
        result = {
            "instance_id": example["instance_id"],
            "success": False,
            "patch_applied": False,
            "model_patch": "",
            "error": None,
            "output": ""
        }
        
        try:
            # First apply test patch to set up the environment
            print("Applying test patch...")
            test_patch_applied = self.apply_patch(example["test_patch"])
            
            if not test_patch_applied:
                result["error"] = "Failed to apply test patch"
                return result
            
            # Now run Claude Code to generate the actual fix
            problem_statement = example.get("problem_statement", "")
            if not problem_statement:
                result["error"] = "No problem statement provided"
                return result
                
            model_patch = self.run_claude_code_fix(problem_statement)
            
            if model_patch:
                result["model_patch"] = model_patch
                result["patch_applied"] = True
                result["success"] = True
                print("Successfully generated fix with Claude Code")
            else:
                result["error"] = "Claude Code failed to generate a fix"
                    
        except Exception as e:
            result["error"] = f"Exception during fixing: {str(e)}"
        
        return result