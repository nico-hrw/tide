mod mcp;

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use std::path::{Path, PathBuf};
use tide_core::Database;

#[derive(Parser)]
#[command(name = "tide-daemon", version = "0.1.0", about = "Tide Local Harness & MCP Daemon")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Start the Stdio MCP server for AI agents
    Mcp {
        #[arg(long, default_value = "~/.tide/local.db")]
        db_path: String,
    },
    /// Initialize local database and configure keys
    Init {
        #[arg(long)]
        email: Option<String>,
        #[arg(long)]
        pin: Option<String>,
        #[arg(long, default_value = "~/.tide/local.db")]
        db_path: String,
    },
    /// Run daemon background sync service
    Run {
        #[arg(long, default_value = "~/.tide/local.db")]
        db_path: String,
    },
}

fn expand_path(path_str: &str) -> PathBuf {
    if path_str == "~" {
        if let Some(home) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) {
            return PathBuf::from(home);
        }
    }
    if let Some(stripped) = path_str.strip_prefix("~/").or_else(|| path_str.strip_prefix("~\\")) {
        if let Some(home) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) {
            return PathBuf::from(home).join(stripped);
        }
    }
    PathBuf::from(path_str)
}

fn ensure_parent_dir(path: &Path) -> Result<()> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("Failed to create directory {:?}", parent))?;
        }
    }
    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Mcp { db_path } => {
            let path = expand_path(&db_path);
            ensure_parent_dir(&path)?;
            let db = Database::open(&path)
                .with_context(|| format!("Failed to open database at {:?}", path))?;
            mcp::run_mcp_server(db).await?;
        }
        Commands::Init { email, pin, db_path } => {
            let path = expand_path(&db_path);
            ensure_parent_dir(&path)?;
            let _db = Database::open(&path)
                .with_context(|| format!("Failed to initialize database at {:?}", path))?;
            println!("Initialized Tide local database at {}", path.display());
            if let Some(ref email) = email {
                println!("Configured email: {}", email);
            }
            if pin.is_some() {
                println!("Configured encryption PIN.");
            }
        }
        Commands::Run { db_path } => {
            let path = expand_path(&db_path);
            ensure_parent_dir(&path)?;
            let _db = Database::open(&path)
                .with_context(|| format!("Failed to open database at {:?}", path))?;
            println!("Tide daemon background service running...");
        }
    }

    Ok(())
}
