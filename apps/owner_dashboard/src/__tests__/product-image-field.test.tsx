import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ProductImageField,
  validateAndCompressProductImage,
  resolveImageMime,
  MAX_IMAGE_FILE_SIZE_BYTES,
} from "@/features/catalog/product-image-field";

describe("ProductImageField — security & format validation (S3)", () => {
  it("rejects non-allowlisted MIME types (SVG, PDF, text)", async () => {
    const invalidFile = new File(["<svg></svg>"], "test.svg", {
      type: "image/svg+xml",
    });

    await expect(validateAndCompressProductImage(invalidFile)).rejects.toThrow(
      /Formato no permitido/i,
    );
  });

  it("rejects files exceeding the 2 MB maximum size threshold", async () => {
    const largeContent = new Uint8Array(MAX_IMAGE_FILE_SIZE_BYTES + 1024);
    const largeFile = new File([largeContent], "huge.jpg", {
      type: "image/jpeg",
    });

    await expect(validateAndCompressProductImage(largeFile)).rejects.toThrow(
      /El archivo es muy pesado/i,
    );
  });

  it("renders empty placeholder when no image value is provided", () => {
    const onChange = vi.fn();
    render(<ProductImageField value={null} onChange={onChange} />);

    expect(screen.getByText(/Subir foto/i)).toBeInTheDocument();
    expect(screen.queryByTestId("product-image-preview")).not.toBeInTheDocument();
    expect(screen.queryByTestId("remove-product-image-button")).not.toBeInTheDocument();
  });

  it("renders preview and remove button when image value is provided", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <ProductImageField
        value="data:image/webp;base64,mockValidData"
        onChange={onChange}
      />,
    );

    const preview = screen.getByTestId("product-image-preview");
    expect(preview).toBeInTheDocument();
    expect(preview).toHaveAttribute("src", "data:image/webp;base64,mockValidData");

    const removeBtn = screen.getByTestId("remove-product-image-button");
    expect(removeBtn).toBeInTheDocument();

    await user.click(removeBtn);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  // JPEG acceptance (reported defect): several OS/browser combos report .jpg
  // files with the non-canonical alias "image/jpg" or with an EMPTY file.type
  // (no OS registry mapping). The strict includes(file.type) check rejected
  // both, so real JPEGs never reached the compressor.
  it("accepts JPEG files reported with the image/jpg MIME alias", () => {
    const file = new File(["jpeg"], "photo.jpg", { type: "image/jpg" });
    expect(resolveImageMime(file)).toBe("image/jpeg");
  });

  it("accepts JPEG files whose MIME type is empty by falling back to the extension", () => {
    const file = new File(["jpeg"], "photo.jpg", { type: "" });
    expect(resolveImageMime(file)).toBe("image/jpeg");

    const altFile = new File(["jpeg"], "photo.JPEG", { type: "" });
    expect(resolveImageMime(altFile)).toBe("image/jpeg");
  });

  it("resolves png and webp extensions when MIME type is empty", () => {
    expect(resolveImageMime(new File(["png"], "shot.png", { type: "" }))).toBe(
      "image/png",
    );
    expect(
      resolveImageMime(new File(["webp"], "shot.webp", { type: "" })),
    ).toBe("image/webp");
  });

  it("still rejects unknown types and unknown extensions with empty MIME", async () => {
    // Unresolvable: no MIME and no known image extension.
    expect(
      resolveImageMime(new File(["x"], "doc.pdf", { type: "" })),
    ).toBeNull();

    // Resolvable but outside the allowlist: the compression gate rejects them.
    await expect(
      validateAndCompressProductImage(
        new File(["x"], "anim.gif", { type: "image/gif" }),
      ),
    ).rejects.toThrow(/Formato no permitido/i);
    await expect(
      validateAndCompressProductImage(
        new File(["x"], "vector.svg", { type: "image/svg+xml" }),
      ),
    ).rejects.toThrow(/Formato no permitido/i);
  });
});
