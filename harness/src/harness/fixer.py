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
        
        # Create log file immediately in the parent run directory
        self.run_dir = self.repo_path.parent
        self.log_file = self.run_dir / "claude_output.log"
        
        # Initialize the log file
        with open(self.log_file, "w") as f:
            f.write(f"=== SWE-bench Issue Fixer Log ===\n")
            f.write(f"Repository: {self.repo_path}\n")
            f.write(f"Started at: {subprocess.run(['date'], capture_output=True, text=True).stdout.strip()}\n")
            f.write("=" * 50 + "\n\n")
    
    def apply_patch(self, patch_content: str) -> bool:
        """
        Apply a patch to the repository.
        
        Args:
            patch_content: The patch content as a string
            
        Returns:
            True if patch applied successfully
        """
        os.chdir(self.repo_path)
        
        # Log patch application
        with open(self.log_file, "a") as f:
            f.write(f"\n=== Applying Patch ===\n")
            f.write(f"Patch length: {len(patch_content)} characters\n")
            f.write("Patch content (first 500 chars):\n")
            f.write(patch_content[:500] + ("..." if len(patch_content) > 500 else "") + "\n")
        
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
            
            # Log result
            with open(self.log_file, "a") as f:
                f.write(f"Git apply return code: {result.returncode}\n")
                if result.stdout:
                    f.write(f"Stdout: {result.stdout}\n")
                if result.stderr:
                    f.write(f"Stderr: {result.stderr}\n")
            
            if result.returncode == 0:
                print("Patch applied successfully")
                return True
            else:
                print(f"Patch application failed: {result.stderr}")
                return False
                
        except Exception as e:
            print(f"Error applying patch: {str(e)}")
            with open(self.log_file, "a") as f:
                f.write(f"ERROR applying patch: {str(e)}\n")
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
        
        # Create log file in the parent run directory
        run_dir = self.repo_path.parent
        log_file = run_dir / "claude_output.log"
        
        try:
            print("Running Claude Code to generate fix...")
            
            # Run claude code with the problem statement
            # No need to escape when using subprocess with list format
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
            
            # Write all output to log file
            with open(log_file, "w") as f:
                f.write(f"Command: {' '.join(cmd)}\n")
                f.write(f"Return code: {result.returncode}\n")
                f.write("=== STDOUT ===\n")
                f.write(result.stdout)
                f.write("\n=== STDERR ===\n")
                f.write(result.stderr)
                f.write("\n")
            
            if result.returncode == 0:
                print("Claude Code completed successfully")
                
                # Try to get the git diff as the patch
                diff_result = subprocess.run(
                    ["git", "diff"],
                    capture_output=True,
                    text=True
                )
                
                # Append diff to log file
                with open(log_file, "a") as f:
                    f.write("=== GIT DIFF ===\n")
                    f.write(diff_result.stdout)
                    f.write("\n")
                
                if diff_result.returncode == 0 and diff_result.stdout.strip():
                    return diff_result.stdout
                else:
                    print("No changes detected after Claude Code run")
                    return None
            else:
                print(f"Claude Code failed: {result.stderr}")
                return None
                
        except subprocess.TimeoutExpired:
            error_msg = "Claude Code execution timed out"
            print(error_msg)
            with open(log_file, "a") as f:
                f.write(f"ERROR: {error_msg}\n")
            return None
        except Exception as e:
            error_msg = f"Error running Claude Code: {str(e)}"
            print(error_msg)
            with open(log_file, "a") as f:
                f.write(f"ERROR: {error_msg}\n")
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
        
        # Log the start of fix_issue
        with open(self.log_file, "a") as f:
            f.write(f"\n=== Starting fix_issue for {example['instance_id']} ===\n")
        
        try:
            # First apply test patch to set up the environment
            print("Applying test patch...")
            with open(self.log_file, "a") as f:
                f.write("\nApplying test patch to set up environment...\n")
            
            test_patch_applied = self.apply_patch(example["test_patch"])
            
            if not test_patch_applied:
                result["error"] = "Failed to apply test patch"
                with open(self.log_file, "a") as f:
                    f.write("ERROR: Failed to apply test patch\n")
                return result
            
            # Now run Claude Code to generate the actual fix
            problem_statement = example.get("problem_statement", "")
            if not problem_statement:
                result["error"] = "No problem statement provided"
                with open(self.log_file, "a") as f:
                    f.write("ERROR: No problem statement provided\n")
                return result
                
            model_patch = self.run_claude_code_fix(problem_statement)
            
            if model_patch:
                result["model_patch"] = model_patch
                result["patch_applied"] = True
                result["success"] = True
                print("Successfully generated fix with Claude Code")
                with open(self.log_file, "a") as f:
                    f.write("\nSUCCESS: Generated fix with Claude Code\n")
            else:
                result["error"] = "Claude Code failed to generate a fix"
                with open(self.log_file, "a") as f:
                    f.write("\nERROR: Claude Code failed to generate a fix\n")
                    
        except Exception as e:
            result["error"] = f"Exception during fixing: {str(e)}"
        
        return result