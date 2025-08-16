"""Issue fixing logic for SWE-bench examples."""

import subprocess
import os
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple


class IssueFixer:
    """Handles non-interactive fixing of SWE-bench issues."""
    
    def __init__(self, repo_path: Path):
        """Initialize the fixer with a repository path."""
        self.repo_path = repo_path
        self.original_cwd = os.getcwd()
    
    def run_tests(self, test_command: Optional[str] = None) -> Tuple[bool, str]:
        """
        Run tests in the repository.
        
        Args:
            test_command: Optional custom test command
            
        Returns:
            Tuple of (success, output)
        """
        os.chdir(self.repo_path)
        
        try:
            if test_command:
                cmd = test_command
            else:
                # Try common test commands
                if (self.repo_path / "pytest.ini").exists() or (self.repo_path / "setup.cfg").exists():
                    cmd = "python -m pytest"
                elif (self.repo_path / "manage.py").exists():
                    cmd = "python manage.py test"
                elif (self.repo_path / "tox.ini").exists():
                    cmd = "tox"
                else:
                    cmd = "python -m pytest"
            
            print(f"Running tests: {cmd}")
            result = subprocess.run(
                cmd, 
                shell=True, 
                capture_output=True, 
                text=True,
                timeout=300  # 5 minute timeout
            )
            
            return result.returncode == 0, result.stdout + result.stderr
            
        except subprocess.TimeoutExpired:
            return False, "Test execution timed out"
        except Exception as e:
            return False, f"Error running tests: {str(e)}"
        finally:
            os.chdir(self.original_cwd)
    
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
    
    def create_simple_fix(self, problem_statement: str, files_to_edit: List[str]) -> Optional[str]:
        """
        Create a simple fix based on the problem statement.
        This is a placeholder for more sophisticated fixing logic.
        
        Args:
            problem_statement: Description of the issue
            files_to_edit: List of files that might need editing
            
        Returns:
            Patch content or None if no fix could be generated
        """
        print("Analyzing problem statement...")
        print(f"Problem: {problem_statement}")
        print(f"Files to consider: {files_to_edit}")
        
        # This is a placeholder - in a real implementation, you might:
        # 1. Use static analysis to understand the code
        # 2. Apply LLM-based code generation
        # 3. Use pattern matching for common bug types
        # 4. Implement specific fixes for known issue patterns
        
        return None
    
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
            "tests_passed_before": False,
            "tests_passed_after": False,
            "error": None,
            "output": ""
        }
        
        try:
            # Run initial tests
            print("Running initial tests...")
            tests_pass, test_output = self.run_tests(example.get("test_cmd"))
            result["tests_passed_before"] = tests_pass
            result["output"] += f"Initial tests: {'PASSED' if tests_pass else 'FAILED'}\\n"
            result["output"] += test_output + "\\n"
            
            # If we have a reference patch, try applying it
            if "patch" in example:
                print("Applying reference patch...")
                patch_applied = self.apply_patch(example["patch"])
                result["patch_applied"] = patch_applied
                
                if patch_applied:
                    # Run tests after patch
                    print("Running tests after patch...")
                    tests_pass_after, test_output_after = self.run_tests(example.get("test_cmd"))
                    result["tests_passed_after"] = tests_pass_after
                    result["output"] += f"Tests after patch: {'PASSED' if tests_pass_after else 'FAILED'}\\n"
                    result["output"] += test_output_after + "\\n"
                    result["success"] = tests_pass_after
                else:
                    result["error"] = "Failed to apply reference patch"
            else:
                # Try to create a simple fix
                problem_statement = example.get("problem_statement", "")
                files_to_edit = example.get("hints_text", "").split() if "hints_text" in example else []
                
                patch = self.create_simple_fix(problem_statement, files_to_edit)
                if patch:
                    patch_applied = self.apply_patch(patch)
                    result["patch_applied"] = patch_applied
                    
                    if patch_applied:
                        tests_pass_after, test_output_after = self.run_tests(example.get("test_cmd"))
                        result["tests_passed_after"] = tests_pass_after
                        result["output"] += f"Tests after fix: {'PASSED' if tests_pass_after else 'FAILED'}\\n"
                        result["output"] += test_output_after + "\\n"
                        result["success"] = tests_pass_after
                    else:
                        result["error"] = "Failed to apply generated patch"
                else:
                    result["error"] = "Could not generate a fix for this issue"
                    
        except Exception as e:
            result["error"] = f"Exception during fixing: {str(e)}"
        
        return result