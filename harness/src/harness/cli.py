"""Command-line interface for the SWE-bench harness."""

import click
import json
import sys
from pathlib import Path
from typing import Optional

from .loader import SWEBenchLoader
from .repo_manager import RepoManager
from .fixer import IssueFixer


@click.group()
def main():
    """SWE-bench issue fixing harness."""
    pass


@main.command()
@click.option("--dataset", "-d", default="princeton-nlp/SWE-bench_Lite", 
              help="SWE-bench dataset to use")
def list_examples(dataset: str):
    """List all available examples in the dataset."""
    loader = SWEBenchLoader(dataset)
    instance_ids = loader.list_instance_ids()
    
    click.echo(f"Found {len(instance_ids)} examples in {dataset}:")
    for instance_id in instance_ids:
        click.echo(f"  {instance_id}")


@main.command()
@click.argument("instance_id")
@click.option("--dataset", "-d", default="princeton-nlp/SWE-bench_Lite", 
              help="SWE-bench dataset to use")
@click.option("--output", "-o", type=click.Path(), 
              help="Output file for results (JSON)")
@click.option("--temp-dir", "-t", type=click.Path(), 
              help="Base directory for temporary files")
def fix(instance_id: str, dataset: str, output: Optional[str], temp_dir: Optional[str]):
    """Fix a specific SWE-bench issue."""
    
    # Load the example
    loader = SWEBenchLoader(dataset)
    example = loader.get_example(instance_id)
    
    if not example:
        click.echo(f"Error: Instance ID '{instance_id}' not found in dataset {dataset}", err=True)
        sys.exit(1)
    
    click.echo(f"Processing example: {instance_id}")
    click.echo(f"Repository: {example.get('repo', 'Unknown')}")
    click.echo(f"Base commit: {example.get('base_commit', 'Unknown')}")
    
    # Extract repository info
    repo_url = example.get("repo", "")
    if not repo_url.startswith(("http://", "https://")):
        repo_url = f"https://github.com/{repo_url}.git"
    
    base_commit = example.get("base_commit", "")
    if not base_commit:
        click.echo("Error: No base commit found in example", err=True)
        sys.exit(1)
    
    # Process the example
    with RepoManager() as repo_manager:
        try:
            # Checkout repository
            repo_path = repo_manager.checkout_repo(repo_url, base_commit, temp_dir)
            
            # Fix the issue
            fixer = IssueFixer(repo_path)
            result = fixer.fix_issue(example)
            
            # Print results
            click.echo("\\n" + "="*50)
            click.echo("RESULTS:")
            click.echo("="*50)
            click.echo(f"Instance ID: {result['instance_id']}")
            click.echo(f"Success: {result['success']}")
            click.echo(f"Patch Applied: {result['patch_applied']}")
            click.echo(f"Tests Passed Before: {result['tests_passed_before']}")
            click.echo(f"Tests Passed After: {result['tests_passed_after']}")
            
            if result.get("error"):
                click.echo(f"Error: {result['error']}")
            
            if result.get("output"):
                click.echo("\\nDetailed Output:")
                click.echo(result["output"])
            
            # Save results to file if specified
            if output:
                with open(output, 'w') as f:
                    json.dump(result, f, indent=2)
                click.echo(f"\\nResults saved to: {output}")
            
        except Exception as e:
            click.echo(f"Error processing example: {str(e)}", err=True)
            sys.exit(1)


@main.command()
@click.option("--dataset", "-d", default="princeton-nlp/SWE-bench_Lite", 
              help="SWE-bench dataset to use")
@click.option("--output-dir", "-o", type=click.Path(), required=True,
              help="Output directory for results")
@click.option("--temp-dir", "-t", type=click.Path(), 
              help="Base directory for temporary files")
@click.option("--limit", "-l", type=int, 
              help="Limit number of examples to process")
def fix_all(dataset: str, output_dir: str, temp_dir: Optional[str], limit: Optional[int]):
    """Fix all issues in the dataset."""
    
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    loader = SWEBenchLoader(dataset)
    instance_ids = loader.list_instance_ids()
    
    if limit:
        instance_ids = instance_ids[:limit]
    
    click.echo(f"Processing {len(instance_ids)} examples...")
    
    results = []
    for i, instance_id in enumerate(instance_ids, 1):
        click.echo(f"\\n[{i}/{len(instance_ids)}] Processing {instance_id}...")
        
        try:
            example = loader.get_example(instance_id)
            if not example:
                click.echo(f"  Skipping: Example not found")
                continue
            
            repo_url = example.get("repo", "")
            if not repo_url.startswith(("http://", "https://")):
                repo_url = f"https://github.com/{repo_url}.git"
            
            base_commit = example.get("base_commit", "")
            if not base_commit:
                click.echo(f"  Skipping: No base commit")
                continue
            
            with RepoManager() as repo_manager:
                repo_path = repo_manager.checkout_repo(repo_url, base_commit, temp_dir)
                fixer = IssueFixer(repo_path)
                result = fixer.fix_issue(example)
                results.append(result)
                
                # Save individual result
                result_file = output_path / f"{instance_id}.json"
                with open(result_file, 'w') as f:
                    json.dump(result, f, indent=2)
                
                click.echo(f"  Result: {'SUCCESS' if result['success'] else 'FAILED'}")
        
        except Exception as e:
            click.echo(f"  Error: {str(e)}")
            results.append({
                "instance_id": instance_id,
                "success": False,
                "error": str(e)
            })
    
    # Save summary
    summary = {
        "total": len(results),
        "successful": sum(1 for r in results if r.get("success", False)),
        "failed": sum(1 for r in results if not r.get("success", False)),
        "results": results
    }
    
    summary_file = output_path / "summary.json"
    with open(summary_file, 'w') as f:
        json.dump(summary, f, indent=2)
    
    click.echo(f"\\n" + "="*50)
    click.echo("SUMMARY:")
    click.echo("="*50)
    click.echo(f"Total: {summary['total']}")
    click.echo(f"Successful: {summary['successful']}")
    click.echo(f"Failed: {summary['failed']}")
    click.echo(f"Success Rate: {summary['successful']/summary['total']*100:.1f}%")
    click.echo(f"Results saved to: {output_path}")


if __name__ == "__main__":
    main()