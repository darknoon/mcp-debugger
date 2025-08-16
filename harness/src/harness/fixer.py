"""Issue fixing logic for SWE-bench examples."""

import subprocess
import os
from pathlib import Path
from typing import Dict, Any, Optional


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
    
    def run_claude_code_fix(self, problem_statement: str, timeout: int = 600) -> Optional[str]:
        """
        Run Claude Code non-interactively to fix the issue.
        
        Args:
            problem_statement: Description of the issue to fix
            timeout: Timeout in seconds (default 600 = 10 minutes)
            
        Returns:
            Generated patch content or None if fix failed
        """
        os.chdir(self.repo_path)
        
        # Log the start
        with open(self.log_file, "a") as f:
            f.write(f"\n=== Running Claude Code ===\n")
            f.write(f"Problem statement length: {len(problem_statement)} characters\n")
            f.write(f"Timeout: {timeout} seconds\n")
            f.flush()
        
        try:
            print("Running Claude Code to generate fix...")
            
            # Build a proper prompt for Claude
            prompt = f"""You are fixing a bug in a repository. The test environment has already been set up with the failing test case.

ISSUE DESCRIPTION:
{problem_statement}

INSTRUCTIONS:
1. First, explore the repository structure to understand the codebase
2. Locate and read the relevant files mentioned in the issue
3. Run any tests to understand the failure
4. Make the necessary code changes to fix the issue
5. Verify your fix works by running the tests again

Please fix this issue now. Focus on making minimal, targeted changes that address the root cause."""
            cmd = [
                "claude", 
                "--print",
                "--verbose",
                "--output-format", "text",
                "--dangerously-skip-permissions",  # Skip permission prompts for sandboxed environment
                "--add-dir", str(self.repo_path),  # Restrict access to just the repo directory
                "--model", "sonnet",
                prompt
            ]
            
            # Log full command
            with open(self.log_file, "a") as f:
                f.write(f"Command parts: {len(cmd)} elements\n")
                f.write(f"  claude --print --model sonnet [prompt with {len(prompt)} chars]\n")
                f.write(f"Working directory: {os.getcwd()}\n")
                f.write("Starting execution...\n")
                f.flush()
            
            print(f"Executing Claude Code with {timeout}s timeout...")
            print(f"Streaming output to: {self.log_file}")
            
            # Stream output in real-time to log file
            with open(self.log_file, "a") as log:
                log.write("\n=== CLAUDE CODE EXECUTION ===\n")
                log.flush()
                
                # Run with real-time output streaming
                process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,  # Merge stderr into stdout
                    text=True,
                    bufsize=1  # Line buffered
                )
                
                # Stream output line by line
                for line in iter(process.stdout.readline, ''):
                    if line:
                        log.write(line)
                        log.flush()
                        print(f"  {line.rstrip()}")
                
                process.wait(timeout=timeout)
                returncode = process.returncode
                
                log.write(f"\nReturn code: {returncode}\n")
                log.write("=== END EXECUTION ===\n")
                log.flush()
            
            if returncode == 0:
                print("Claude Code completed successfully")
                
                # Try to get the git diff as the patch
                diff_result = subprocess.run(
                    ["git", "diff"],
                    capture_output=True,
                    text=True
                )
                
                # Append diff to log file
                with open(self.log_file, "a") as f:
                    f.write("=== GIT DIFF ===\n")
                    f.write(diff_result.stdout)
                    f.write("\n")
                
                if diff_result.returncode == 0 and diff_result.stdout.strip():
                    return diff_result.stdout
                else:
                    print("No changes detected after Claude Code run")
                    return None
            else:
                print(f"Claude Code failed with return code: {returncode}")
                return None
                
        except subprocess.TimeoutExpired:
            error_msg = f"Claude Code execution timed out after {timeout} seconds"
            print(error_msg)
            with open(self.log_file, "a") as f:
                f.write(f"ERROR: {error_msg}\n")
            return None
        except Exception as e:
            error_msg = f"Error running Claude Code: {str(e)}"
            print(error_msg)
            with open(self.log_file, "a") as f:
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
            
            # Commit the test patch so we can isolate Claude's changes
            os.chdir(self.repo_path)
            # Configure git user if not set
            subprocess.run(["git", "config", "user.name", "SWE-bench"], capture_output=True)
            subprocess.run(["git", "config", "user.email", "swe-bench@example.com"], capture_output=True)
            subprocess.run(["git", "add", "-A"], capture_output=True)
            subprocess.run(["git", "commit", "-m", "Applied test patch"], capture_output=True)
            os.chdir(self.original_cwd)
            
            with open(self.log_file, "a") as f:
                f.write("Committed test patch to isolate Claude's changes\n")
            
            # Now run Claude Code to generate the actual fix
            problem_statement = example.get("problem_statement", "")
            if not problem_statement:
                result["error"] = "No problem statement provided"
                with open(self.log_file, "a") as f:
                    f.write("ERROR: No problem statement provided\n")
                return result
                
            model_patch = self.run_claude_code_fix(problem_statement, timeout=1200)  # 20 minutes for complex issues
            
            if model_patch:
                result["model_patch"] = model_patch
                result["patch_applied"] = True
                result["success"] = True
                
                # Save the patch to a file for easy inspection
                patch_file = self.run_dir / "model_patch.diff"
                with open(patch_file, "w") as f:
                    f.write(model_patch)
                
                print(f"Successfully generated fix with Claude Code")
                print(f"Patch saved to: {patch_file}")
                
                with open(self.log_file, "a") as f:
                    f.write("\nSUCCESS: Generated fix with Claude Code\n")
                    f.write(f"Patch saved to: {patch_file}\n")
            else:
                result["error"] = "Claude Code failed to generate a fix"
                with open(self.log_file, "a") as f:
                    f.write("\nERROR: Claude Code failed to generate a fix\n")
                    
        except Exception as e:
            result["error"] = f"Exception during fixing: {str(e)}"
        
        return result