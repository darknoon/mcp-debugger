"""Git repository management for SWE-bench examples."""

import os
import tempfile
import shutil
from pathlib import Path
from typing import Optional
from git import Repo, GitCommandError


class RepoManager:
    """Manages git repository operations for SWE-bench examples."""
    
    def __init__(self):
        """Initialize the repository manager."""
        self.temp_dirs = []
    
    def checkout_repo(self, repo_url: str, commit_hash: str, base_path: Optional[str] = None) -> Path:
        """
        Checkout a specific commit from a repository in a temporary directory.
        
        Args:
            repo_url: Git repository URL
            commit_hash: Commit hash to checkout
            base_path: Optional base path for temporary directory
            
        Returns:
            Path to the checked out repository
        """
        if base_path:
            temp_dir = tempfile.mkdtemp(dir=base_path)
        else:
            temp_dir = tempfile.mkdtemp()
        
        self.temp_dirs.append(temp_dir)
        repo_path = Path(temp_dir) / "repo"
        
        try:
            print(f"Cloning repository: {repo_url}")
            repo = Repo.clone_from(repo_url, repo_path)
            
            print(f"Checking out commit: {commit_hash}")
            repo.git.checkout(commit_hash)
            
            print(f"Repository checked out at: {repo_path}")
            return repo_path
            
        except GitCommandError as e:
            print(f"Git error: {e}")
            self.cleanup_temp_dir(temp_dir)
            raise
        except Exception as e:
            print(f"Error during checkout: {e}")
            self.cleanup_temp_dir(temp_dir)
            raise
    
    def cleanup_temp_dir(self, temp_dir: str) -> None:
        """Clean up a specific temporary directory."""
        if temp_dir in self.temp_dirs:
            self.temp_dirs.remove(temp_dir)
        
        if os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir)
                print(f"Cleaned up temporary directory: {temp_dir}")
            except Exception as e:
                print(f"Error cleaning up {temp_dir}: {e}")
    
    def cleanup_all(self) -> None:
        """Clean up all temporary directories."""
        for temp_dir in self.temp_dirs.copy():
            self.cleanup_temp_dir(temp_dir)
    
    def __enter__(self):
        """Context manager entry."""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit - cleanup all temporary directories."""
        self.cleanup_all()