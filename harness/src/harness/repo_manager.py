"""Git repository management for SWE-bench examples."""

from pathlib import Path
from typing import Optional
from git import Repo, GitCommandError


class RepoManager:
    """Manages git repository operations for SWE-bench examples."""
    
    def __init__(self):
        """Initialize the repository manager."""
        pass
    
    def checkout_repo(self, repo_url: str, commit_hash: str, instance_id: str, base_path: Optional[str] = None) -> Path:
        """
        Checkout a specific commit from a repository in a run directory.
        
        Args:
            repo_url: Git repository URL
            commit_hash: Commit hash to checkout
            instance_id: Instance ID for naming the run directory
            base_path: Optional base path for run directories
            
        Returns:
            Path to the checked out repository
        """
        import hashlib
        import time
        
        if base_path:
            runs_dir = Path(base_path) / "runs"
        else:
            runs_dir = Path.cwd() / "runs"
            
        runs_dir.mkdir(exist_ok=True)
        
        # Create a unique run directory with timestamp hash
        timestamp_hash = hashlib.md5(str(time.time()).encode()).hexdigest()[:8]
        run_dir = runs_dir / f"{instance_id}-{timestamp_hash}"
        run_dir.mkdir(exist_ok=True)
        
        repo_path = run_dir / "repo"
        
        try:
            print(f"Cloning repository: {repo_url}")
            repo = Repo.clone_from(repo_url, repo_path)
            
            print(f"Checking out commit: {commit_hash}")
            repo.git.checkout(commit_hash)
            
            print(f"Repository checked out at: {repo_path}")
            return repo_path
            
        except GitCommandError as e:
            print(f"Git error: {e}")
            raise
        except Exception as e:
            print(f"Error during checkout: {e}")
            raise
    
