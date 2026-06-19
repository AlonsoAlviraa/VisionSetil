"""Diagnose taxonomic coverage between converted observations and the species catalog.

Usage:
    python eval/scripts/diagnose_catalog.py \
      --converted /kaggle/working/visionsetil_outputs/converted_fungiclef2025_observations.json \
      --catalog /kaggle/working/visionsetil_outputs/real_species_catalog.json \
      --output /kaggle/working/visionsetil_outputs/catalog_diagnostics.json
"""
import argparse
import json
import sys
from collections import Counter
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="Diagnose catalog coverage for VisionSetil benchmark.")
    parser.add_argument("--converted", required=True, help="Path to converted observations JSON.")
    parser.add_argument("--catalog", required=True, help="Path to real species catalog JSON.")
    parser.add_argument("--output", required=True, help="Path to write diagnostics JSON.")
    parser.add_argument("--min-species-coverage", type=float, default=0.50,
                        help="Minimum observation-level species coverage required.")
    parser.add_argument("--min-genus-coverage", type=float, default=0.50,
                        help="Minimum observation-level genus coverage required.")
    args = parser.parse_args()

    converted_path = Path(args.converted)
    catalog_path = Path(args.catalog)
    output_path = Path(args.output)

    if not converted_path.exists():
        print(f"ERROR: Converted observations file not found: {converted_path}", file=sys.stderr)
        sys.exit(1)
    if not catalog_path.exists():
        print(f"ERROR: Species catalog file not found: {catalog_path}", file=sys.stderr)
        sys.exit(1)

    with open(converted_path, "r", encoding="utf-8") as f:
        observations = json.load(f)
    with open(catalog_path, "r", encoding="utf-8") as f:
        catalog = json.load(f)

    # Build catalog lookup sets
    catalog_taxa = {item["taxon"].lower() for item in catalog if item.get("taxon")}
    catalog_genera = {item.get("genus", "").lower() for item in catalog if item.get("genus")}
    catalog_families = {item.get("family", "").lower() for item in catalog if item.get("family")}

    # Count observations
    total_obs = len(observations)
    expected_taxa = Counter()
    expected_genera = Counter()
    expected_families = Counter()
    covered_taxa = 0
    covered_genera = 0
    covered_families = 0
    missing_taxa = []
    missing_genera = []

    for obs in observations:
        taxon = (obs.get("expected_taxon") or "unknown_fungus").lower()
        genus = (obs.get("expected_genus") or "unknown").lower()
        family = (obs.get("expected_family") or "unknown").lower()

        expected_taxa[taxon] += 1
        expected_genera[genus] += 1
        expected_families[family] += 1

        if taxon in catalog_taxa:
            covered_taxa += 1
        else:
            missing_taxa.append(taxon)

        if genus in catalog_genera:
            covered_genera += 1
        else:
            missing_genera.append(genus)

        if family in catalog_families:
            covered_families += 1

    # Compute coverage rates
    species_coverage = round(covered_taxa / total_obs, 4) if total_obs > 0 else 0.0
    genus_coverage = round(covered_genera / total_obs, 4) if total_obs > 0 else 0.0
    family_coverage = round(covered_families / total_obs, 4) if total_obs > 0 else 0.0

    # Unique missing
    unique_missing_taxa = sorted(set(missing_taxa))
    unique_missing_genera = sorted(set(missing_genera))

    diagnostics = {
        "total_observations": total_obs,
        "total_catalog_species": len(catalog_taxa),
        "total_catalog_genera": len(catalog_genera),
        "total_catalog_families": len(catalog_families),
        "species_coverage_rate": species_coverage,
        "genus_coverage_rate": genus_coverage,
        "family_coverage_rate": family_coverage,
        "covered_taxa_count": covered_taxa,
        "covered_genera_count": covered_genera,
        "covered_families_count": covered_families,
        "unique_missing_taxa": unique_missing_taxa,
        "unique_missing_genera": unique_missing_genera,
        "top_expected_taxa": expected_taxa.most_common(20),
        "top_expected_genera": expected_genera.most_common(20),
        "validation_passed": (
            species_coverage >= args.min_species_coverage
            and genus_coverage >= args.min_genus_coverage
        ),
    }

    if species_coverage < args.min_species_coverage:
        print(f"ERROR: Species coverage is below the required threshold "
              f"({species_coverage*100:.2f}% < {args.min_species_coverage*100:.2f}%).", file=sys.stderr)
        sys.exit(1)

    if genus_coverage < args.min_genus_coverage:
        print(f"ERROR: Genus coverage is too low ({genus_coverage*100:.2f}% < "
              f"{args.min_genus_coverage*100:.2f}%). "
              f"Missing genera: {unique_missing_genera[:10]}", file=sys.stderr)
        sys.exit(1)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(diagnostics, f, indent=2, ensure_ascii=False)

    # Generate markdown report
    md_path = output_path.with_suffix(".md")
    md_content = [
        "# Catalog Coverage Diagnostics Report\n",
        "## Summary\n",
        f"- **Total Observations:** {total_obs}",
        f"- **Catalog Species Count:** {len(catalog_taxa)}",
        f"- **Catalog Genera Count:** {len(catalog_genera)}",
        f"- **Catalog Families Count:** {len(catalog_families)}",
        f"- **Species Coverage Rate:** {species_coverage*100:.2f}%",
        f"- **Genus Coverage Rate:** {genus_coverage*100:.2f}%",
        f"- **Family Coverage Rate:** {family_coverage*100:.2f}%",
        f"- **Validation Passed:** {diagnostics['validation_passed']}\n",
        "## Missing Taxa\n",
    ]
    if unique_missing_taxa:
        md_content.append("| Taxon | Count |")
        md_content.append("| --- | --- |")
        missing_counts = Counter(missing_taxa)
        for taxon in unique_missing_taxa[:30]:
            md_content.append(f"| {taxon} | {missing_counts.get(taxon, 0)} |")
    else:
        md_content.append("All expected taxa are covered in the catalog.\n")

    md_content.append("\n## Missing Genera\n")
    if unique_missing_genera:
        md_content.append("| Genus | Count |")
        md_content.append("| --- | --- |")
        missing_gen_counts = Counter(missing_genera)
        for genus in unique_missing_genera[:20]:
            md_content.append(f"| {genus} | {missing_gen_counts.get(genus, 0)} |")
    else:
        md_content.append("All expected genera are covered in the catalog.\n")

    md_content.append("\n## Top 20 Expected Taxa\n")
    md_content.append("| Taxon | Count |")
    md_content.append("| --- | --- |")
    for taxon, count in diagnostics["top_expected_taxa"]:
        md_content.append(f"| {taxon} | {count} |")

    md_content.append("\n## Top 20 Expected Genera\n")
    md_content.append("| Genus | Count |")
    md_content.append("| --- | --- |")
    for genus, count in diagnostics["top_expected_genera"]:
        md_content.append(f"| {genus} | {count} |")

    with open(md_path, "w", encoding="utf-8") as f:
        f.write("\n".join(md_content))

    print(f"Catalog diagnostics written to {output_path}")
    print(f"Catalog diagnostics markdown written to {md_path}")
    print(f"Species Coverage: {species_coverage*100:.2f}% | Genus Coverage: {genus_coverage*100:.2f}%")


if __name__ == "__main__":
    main()
